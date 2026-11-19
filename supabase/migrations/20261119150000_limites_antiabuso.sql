-- =====================================================================
--  Migración 4: límites anti-abuso para las reservas de la web.
--
--  No se puede identificar un dispositivo (la MAC no llega por internet),
--  así que se limita en el servidor por:
--    · IP de origen (guardada como huella SHA-256, nunca en claro)
--    · email del cliente
--    · reserva duplicada (mismo email y misma sesión)
--  Los valores están en private.web_limits para poder ajustarlos.
-- =====================================================================

create table private.web_limits (
  id                   smallint primary key default 1 check (id = 1),
  max_per_ip_hour      integer not null default 3,
  max_per_ip_day       integer not null default 6,
  max_per_email_day    integer not null default 2
);
insert into private.web_limits (id) values (1);
alter table private.web_limits enable row level security;
revoke all on private.web_limits from anon, authenticated;

create table private.web_reservation_log (
  id         bigint generated always as identity primary key,
  ip_hash    text,
  email      text not null,
  created_at timestamptz not null default now()
);
create index web_reservation_log_ip_idx    on private.web_reservation_log (ip_hash, created_at);
create index web_reservation_log_email_idx on private.web_reservation_log (email, created_at);
alter table private.web_reservation_log enable row level security;
revoke all on private.web_reservation_log from anon, authenticated;

-- IP real del visitante según las cabeceras que añade Supabase
create or replace function private.request_ip_hash()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  headers json;
  ip text;
begin
  headers := nullif(current_setting('request.headers', true), '')::json;
  ip := coalesce(
    headers ->> 'cf-connecting-ip',
    split_part(headers ->> 'x-forwarded-for', ',', 1),
    headers ->> 'x-real-ip'
  );
  ip := nullif(trim(ip), '');
  if ip is null then
    return null;
  end if;
  return encode(extensions.digest(ip, 'sha256'), 'hex');
end;
$$;

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
  v_limits    private.web_limits;
  v_ip        text;
  v_email     text;
begin
  p_adults   := coalesce(p_adults, 0);
  p_children := coalesce(p_children, 0);
  v_email    := lower(trim(coalesce(p_email, '')));

  if p_adults < 0 or p_children < 0 or p_adults + p_children < 1 or p_adults + p_children > 30 then
    raise exception 'Número de personas no válido' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_first_name, ''))) = 0 or length(p_first_name) > 80
     or length(coalesce(p_last_name, '')) > 120 then
    raise exception 'Nombre no válido' using errcode = '22023';
  end if;
  if length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo electrónico no válido' using errcode = '22023';
  end if;
  if length(coalesce(p_phone, '')) > 30 or length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Datos demasiado largos' using errcode = '22023';
  end if;

  -- ── Límites anti-abuso ──────────────────────────────────────────────
  select * into v_limits from private.web_limits where id = 1;
  v_ip := private.request_ip_hash();

  -- Limpieza de registros antiguos (no hace falta guardarlos más tiempo)
  delete from private.web_reservation_log where created_at < now() - interval '7 days';

  if v_ip is not null and (
       (select count(*) from private.web_reservation_log l
         where l.ip_hash = v_ip and l.created_at > now() - interval '1 hour') >= v_limits.max_per_ip_hour
    or (select count(*) from private.web_reservation_log l
         where l.ip_hash = v_ip and l.created_at > now() - interval '1 day') >= v_limits.max_per_ip_day
  ) then
    raise exception 'Has enviado demasiadas reservas seguidas. Inténtalo más tarde o escríbenos por WhatsApp.'
      using errcode = 'P0001';
  end if;

  if (select count(*) from private.web_reservation_log l
       where l.email = v_email and l.created_at > now() - interval '1 day') >= v_limits.max_per_email_day then
    raise exception 'Este correo ya ha hecho varias reservas hoy. Si necesitas otra, escríbenos por WhatsApp.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.reservations r
             where r.session_id = p_session_id and r.email = v_email and r.status <> 'cancelada') then
    raise exception 'Ya hay una reserva con este correo para esta fecha. Si quieres cambiarla, escríbenos por WhatsApp.'
      using errcode = 'P0001';
  end if;

  -- ── Sesión y plazas ─────────────────────────────────────────────────
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
    trim(p_first_name), trim(coalesce(p_last_name, '')), v_email, nullif(trim(p_phone), ''),
    p_adults, p_children, v_amount, v_activity.currency,
    'pendiente', 'web', nullif(trim(p_notes), '')
  )
  returning * into v_res;

  insert into private.web_reservation_log (ip_hash, email) values (v_ip, v_email);

  return query select v_res.booking_code, v_res.amount, v_res.currency, v_res.event_at;
end;
$$;
revoke all on function public.create_web_reservation(uuid, integer, integer, text, text, text, text, text) from public;
grant execute on function public.create_web_reservation(uuid, integer, integer, text, text, text, text, text) to anon, authenticated;
