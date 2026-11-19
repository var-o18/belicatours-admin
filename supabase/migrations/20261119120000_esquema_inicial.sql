-- =====================================================================
--  Bélica Tours · Panel de administración
--  Migración 1: esquema inicial (actividades, sesiones, reservas,
--  historial, correos, datos de pago, roles) + RLS + Storage.
--
--  Zona horaria de negocio: Europe/Madrid. Todas las fechas se guardan
--  como timestamptz (UTC internamente) y se muestran en hora de Madrid.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Esquema privado: tablas y funciones internas que NO se exponen por la API
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------
--  Tipos
-- ---------------------------------------------------------------------
create type public.app_role           as enum ('admin', 'editor');
create type public.activity_status    as enum ('borrador', 'publicada', 'archivada');
create type public.session_status     as enum ('abierta', 'cerrada', 'cancelada');
create type public.reservation_status as enum ('pendiente', 'aceptada', 'pagada', 'cancelada');
create type public.reservation_source as enum ('web', 'manual');
create type public.email_type         as enum ('recepcion', 'aceptacion');
create type public.email_status       as enum ('pendiente', 'enviado', 'fallido');

-- ---------------------------------------------------------------------
--  Roles de usuario (quién puede entrar al panel)
-- ---------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'admin',
  created_at timestamptz not null default now()
);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- updated_at automático
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
--  Actividades / visitas
-- ---------------------------------------------------------------------
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null check (length(trim(title)) > 0),
  subtitle         text,
  category         text not null default 'experiencias'
                     check (category in ('experiencias', 'visitas', 'gastronomia')),
  description      text,
  long_description text,
  duration         text,               -- texto libre: "4 horas", "Día completo"
  difficulty       text,
  meeting_point    text,
  price_adult      numeric(10,2) not null default 0 check (price_adult >= 0),
  price_child      numeric(10,2)            check (price_child >= 0), -- null = mismo que adulto
  currency         char(3) not null default 'EUR',
  capacity         integer check (capacity > 0),  -- plazas por defecto de cada sesión
  highlights       text[] not null default '{}',
  cover_image_path text,               -- ruta en Storage o /images/... de la web
  status           public.activity_status not null default 'borrador',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index activities_status_idx on public.activities (status, sort_order);
create trigger activities_touch before update on public.activities
  for each row execute function private.touch_updated_at();

create table public.activity_images (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  storage_path text not null,
  alt_text     text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index activity_images_activity_idx on public.activity_images (activity_id, sort_order);

-- Sesiones: fecha y hora concretas en que se puede reservar una actividad
create table public.activity_sessions (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  starts_at   timestamptz not null,
  seats       integer not null check (seats > 0),
  status      public.session_status not null default 'abierta',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (activity_id, starts_at)
);
create index activity_sessions_starts_idx on public.activity_sessions (starts_at);
create trigger activity_sessions_touch before update on public.activity_sessions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
--  Códigos de reserva (RES-XXXXXX)
--  Se guardan TODOS los códigos emitidos para no reutilizarlos nunca,
--  aunque la reserva se elimine.
-- ---------------------------------------------------------------------
create table private.booking_codes (
  code       text primary key,
  created_at timestamptz not null default now()
);
alter table private.booking_codes enable row level security;
revoke all on private.booking_codes from anon, authenticated;

create or replace function private.generate_booking_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- 32 caracteres sin 0/O/1/I para que se lean bien al dictarlos
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea;
  candidate text;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    candidate := 'RES-';
    for i in 0..5 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;

    begin
      insert into private.booking_codes (code) values (candidate);
      return candidate;
    exception when unique_violation then
      -- colisión (muy improbable): se genera otro
    end;
  end loop;
end;
$$;
revoke all on function private.generate_booking_code() from public;

-- ---------------------------------------------------------------------
--  Reservas
-- ---------------------------------------------------------------------
create table public.reservations (
  id             uuid primary key default gen_random_uuid(),  -- interno, nunca público
  booking_code   text not null unique,                        -- público: RES-XXXXXX
  activity_id    uuid not null references public.activities (id) on delete restrict,
  session_id     uuid references public.activity_sessions (id) on delete set null,
  event_at       timestamptz not null,
  first_name     text not null check (length(trim(first_name)) > 0),
  last_name      text not null default '',
  email          text,
  phone          text,
  adults         integer not null default 1 check (adults >= 0),
  children       integer not null default 0 check (children >= 0),
  guests         integer generated always as (adults + children) stored,
  amount         numeric(10,2) not null check (amount >= 0),
  currency       char(3) not null default 'EUR',
  status         public.reservation_status not null default 'pendiente',
  source         public.reservation_source not null default 'web',
  customer_notes text,          -- observaciones que escribe el cliente
  internal_notes text,          -- solo para el administrador
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint reservations_guests_positive check (adults + children > 0)
);
create index reservations_activity_idx on public.reservations (activity_id);
create index reservations_session_idx  on public.reservations (session_id);
create index reservations_event_idx    on public.reservations (event_at);
create index reservations_status_idx   on public.reservations (status);
create index reservations_created_idx  on public.reservations (created_at desc);

-- El código siempre lo pone la base de datos (se ignora lo que mande el cliente)
-- y no se puede modificar después.
create or replace function private.reservations_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.booking_code := private.generate_booking_code();
    new.created_by   := coalesce(new.created_by, (select auth.uid()));
  else
    new.booking_code := old.booking_code;
    new.id           := old.id;
    new.created_at   := old.created_at;
    new.updated_at   := now();
  end if;
  return new;
end;
$$;
create trigger reservations_before_write
  before insert or update on public.reservations
  for each row execute function private.reservations_before_write();

-- ---------------------------------------------------------------------
--  Historial de la reserva (estados, ediciones, eliminación)
-- ---------------------------------------------------------------------
create table public.reservation_events (
  id             bigint generated always as identity primary key,
  reservation_id uuid references public.reservations (id) on delete set null,
  booking_code   text not null,           -- se conserva aunque se borre la reserva
  event_type     text not null check (event_type in ('creada', 'estado', 'editada', 'eliminada')),
  old_status     public.reservation_status,
  new_status     public.reservation_status,
  changed_by     uuid references auth.users (id) on delete set null,
  details        jsonb,
  created_at     timestamptz not null default now()
);
create index reservation_events_reservation_idx on public.reservation_events (reservation_id, created_at);

create or replace function private.reservations_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_events (reservation_id, booking_code, event_type, new_status, changed_by, details)
    values (new.id, new.booking_code, 'creada', new.status, (select auth.uid()),
            jsonb_build_object('source', new.source));

  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.reservation_events (reservation_id, booking_code, event_type, old_status, new_status, changed_by)
      values (new.id, new.booking_code, 'estado', old.status, new.status, (select auth.uid()));
    end if;

    if (to_jsonb(new) - array['status', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
      insert into public.reservation_events (reservation_id, booking_code, event_type, changed_by, details)
      values (new.id, new.booking_code, 'editada', (select auth.uid()),
              jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)));
    end if;

  elsif tg_op = 'DELETE' then
    insert into public.reservation_events (reservation_id, booking_code, event_type, old_status, changed_by, details)
    values (null, old.booking_code, 'eliminada', old.status, (select auth.uid()), to_jsonb(old));
  end if;

  return null;
end;
$$;
create trigger reservations_log_event
  after insert or update or delete on public.reservations
  for each row execute function private.reservations_log_event();

-- ---------------------------------------------------------------------
--  Datos de pago (una sola fila, editable desde el panel)
-- ---------------------------------------------------------------------
create table public.payment_settings (
  id               smallint primary key default 1 check (id = 1),
  bizum_enabled    boolean not null default false,
  bizum_phone      text,
  bizum_holder     text,
  transfer_enabled boolean not null default false,
  transfer_holder  text,
  transfer_iban    text,
  transfer_bank    text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  constraint bizum_complete    check (not bizum_enabled    or bizum_phone is not null),
  constraint transfer_complete check (not transfer_enabled or (transfer_holder is not null and transfer_iban is not null))
);
insert into public.payment_settings (id) values (1);
create trigger payment_settings_touch before update on public.payment_settings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
--  Registro de correos
--  payload guarda una copia de lo enviado (incluidos los datos de pago
--  de ese momento) para trazabilidad.
-- ---------------------------------------------------------------------
create table public.email_log (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations (id) on delete set null,
  email_type     public.email_type not null,
  recipient      text not null,
  status         public.email_status not null default 'pendiente',
  payload        jsonb,
  provider_id    text,
  error          text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);
create index email_log_reservation_idx on public.email_log (reservation_id, created_at desc);
-- Evita enviar dos veces el mismo correo: solo puede haber un intento
-- pendiente o enviado por reserva y tipo (los fallidos permiten reintentar).
create unique index email_log_no_duplicates
  on public.email_log (reservation_id, email_type)
  where status in ('pendiente', 'enviado');

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table public.user_roles         enable row level security;
alter table public.activities         enable row level security;
alter table public.activity_images    enable row level security;
alter table public.activity_sessions  enable row level security;
alter table public.reservations       enable row level security;
alter table public.reservation_events enable row level security;
alter table public.payment_settings   enable row level security;
alter table public.email_log          enable row level security;

-- Roles: cada usuario solo ve su propio rol. Se asignan por SQL, no desde la app.
create policy "user_roles: ver el propio" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

-- Actividades: el público ve las publicadas; el admin lo gestiona todo
create policy "activities: público ve publicadas" on public.activities
  for select to anon, authenticated using (status = 'publicada');
create policy "activities: admin todo" on public.activities
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "activity_images: público ve las de publicadas" on public.activity_images
  for select to anon, authenticated using (
    exists (select 1 from public.activities a
            where a.id = activity_id and a.status = 'publicada')
  );
create policy "activity_images: admin todo" on public.activity_images
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "activity_sessions: público ve abiertas" on public.activity_sessions
  for select to anon, authenticated using (
    status = 'abierta' and exists (select 1 from public.activities a
                                   where a.id = activity_id and a.status = 'publicada')
  );
create policy "activity_sessions: admin todo" on public.activity_sessions
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Reservas: SOLO el admin. El público reserva mediante create_web_reservation().
create policy "reservations: admin todo" on public.reservations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "reservation_events: admin lee" on public.reservation_events
  for select to authenticated using (private.is_admin());

create policy "payment_settings: admin lee" on public.payment_settings
  for select to authenticated using (private.is_admin());
create policy "payment_settings: admin edita" on public.payment_settings
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- Los correos los escribe la función del servidor (service role, que salta RLS)
create policy "email_log: admin lee" on public.email_log
  for select to authenticated using (private.is_admin());

-- =====================================================================
--  Funciones públicas (lo único que la web puede ejecutar sin login)
-- =====================================================================

-- Sesiones futuras con plazas libres
create or replace function public.get_public_sessions()
returns table (
  session_id   uuid,
  activity_id  uuid,
  activity_slug text,
  starts_at    timestamptz,
  seats        integer,
  seats_left   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.activity_id, a.slug, s.starts_at, s.seats,
         greatest(s.seats - coalesce((
           select sum(r.guests)::int from public.reservations r
           where r.session_id = s.id and r.status <> 'cancelada'
         ), 0), 0)
  from public.activity_sessions s
  join public.activities a on a.id = s.activity_id
  where s.status = 'abierta'
    and a.status = 'publicada'
    and s.starts_at > now()
  order by s.starts_at;
$$;
revoke all on function public.get_public_sessions() from public;
grant execute on function public.get_public_sessions() to anon, authenticated;

-- Crear una reserva desde la web.
-- Valida los datos, comprueba plazas, calcula el importe en el servidor
-- (el precio NUNCA viene del navegador) y devuelve el código público.
create or replace function public.create_web_reservation(
  p_session_id uuid,
  p_adults     integer,
  p_children   integer,
  p_first_name text,
  p_last_name  text,
  p_email      text,
  p_phone      text,
  p_notes      text default null
)
returns table (booking_code text, amount numeric, currency char(3), event_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session   public.activity_sessions;
  v_activity  public.activities;
  v_taken     integer;
  v_amount    numeric(10,2);
  v_res       public.reservations;
begin
  p_adults   := coalesce(p_adults, 0);
  p_children := coalesce(p_children, 0);

  if p_adults < 0 or p_children < 0 or p_adults + p_children < 1 or p_adults + p_children > 30 then
    raise exception 'Número de personas no válido' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_first_name, ''))) = 0 or length(p_first_name) > 80
     or length(coalesce(p_last_name, '')) > 120 then
    raise exception 'Nombre no válido' using errcode = '22023';
  end if;
  if p_email is null or length(p_email) > 254
     or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo electrónico no válido' using errcode = '22023';
  end if;
  if length(coalesce(p_phone, '')) > 30 or length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Datos demasiado largos' using errcode = '22023';
  end if;

  -- Bloquea la sesión para que dos reservas simultáneas no superen el aforo
  select * into v_session from public.activity_sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'abierta' or v_session.starts_at <= now() then
    raise exception 'Esta sesión ya no admite reservas' using errcode = 'P0001';
  end if;

  select * into v_activity from public.activities where id = v_session.activity_id;
  if v_activity.status <> 'publicada' then
    raise exception 'Esta actividad no está disponible' using errcode = 'P0001';
  end if;

  select coalesce(sum(r.guests), 0) into v_taken
  from public.reservations r
  where r.session_id = v_session.id and r.status <> 'cancelada';

  if v_taken + p_adults + p_children > v_session.seats then
    raise exception 'No quedan plazas suficientes (libres: %)', greatest(v_session.seats - v_taken, 0)
      using errcode = 'P0001';
  end if;

  v_amount := p_adults * v_activity.price_adult
            + p_children * coalesce(v_activity.price_child, v_activity.price_adult);

  insert into public.reservations (
    booking_code, activity_id, session_id, event_at,
    first_name, last_name, email, phone,
    adults, children, amount, currency,
    status, source, customer_notes
  ) values (
    '', v_activity.id, v_session.id, v_session.starts_at,
    trim(p_first_name), trim(coalesce(p_last_name, '')), lower(trim(p_email)), nullif(trim(p_phone), ''),
    p_adults, p_children, v_amount, v_activity.currency,
    'pendiente', 'web', nullif(trim(p_notes), '')
  )
  returning * into v_res;

  return query select v_res.booking_code, v_res.amount, v_res.currency, v_res.event_at;
end;
$$;
revoke all on function public.create_web_reservation(uuid, integer, integer, text, text, text, text, text) from public;
grant execute on function public.create_web_reservation(uuid, integer, integer, text, text, text, text, text) to anon, authenticated;

-- =====================================================================
--  Storage: fotos de actividades
--  Bucket público para lectura (la web muestra las fotos); solo el admin
--  puede subir, cambiar o borrar.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('activity-images', 'activity-images', true)
on conflict (id) do nothing;

create policy "activity-images: admin lista" on storage.objects
  for select to authenticated using (bucket_id = 'activity-images' and private.is_admin());
create policy "activity-images: admin sube" on storage.objects
  for insert to authenticated with check (bucket_id = 'activity-images' and private.is_admin());
create policy "activity-images: admin cambia" on storage.objects
  for update to authenticated using (bucket_id = 'activity-images' and private.is_admin());
create policy "activity-images: admin borra" on storage.objects
  for delete to authenticated using (bucket_id = 'activity-images' and private.is_admin());
