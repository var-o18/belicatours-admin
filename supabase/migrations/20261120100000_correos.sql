-- =====================================================================
--  Migración 5: correos automáticos.
--
--  Cuándo se envía cada correo:
--    · recepcion    → al cliente, cuando llega una reserva desde la web
--    · aviso_admin  → a Bélica Tours, cuando llega una reserva desde la web
--    · aceptacion   → al cliente, cuando una reserva pasa a «aceptada»
--                     (lleva los datos de pago de ese momento)
--
--  Cómo funciona:
--    1. Un trigger apunta el correo en public.email_log como «pendiente».
--    2. Avisa (pg_net) a la Edge Function «send-emails».
--    3. La función envía por Gmail los pendientes y marca cada uno como
--       «enviado» o «fallido». Los fallidos se pueden reintentar desde
--       el panel. El índice único evita enviar dos veces el mismo correo.
--
--  La función no recibe datos de quien la llama: solo procesa lo que
--  hay pendiente en la base de datos, así que llamarla desde fuera no
--  permite enviar nada distinto.
-- =====================================================================

alter type public.email_type add value if not exists 'aviso_admin';

create extension if not exists pg_net with schema extensions;

-- Para que dos envíos simultáneos no manden el mismo correo
alter table public.email_log add column claimed_at timestamptz;
alter table public.email_log add column attempts integer not null default 0;

-- Dirección de la Edge Function (se puede cambiar sin tocar código)
create table private.email_config (
  id           smallint primary key default 1 check (id = 1),
  function_url text not null,
  enabled      boolean not null default true
);
insert into private.email_config (function_url)
values ('https://ollerqgwzswmrnekytwm.supabase.co/functions/v1/send-emails');
alter table private.email_config enable row level security;
revoke all on private.email_config from anon, authenticated;

-- Llama a la función (sin esperar respuesta)
create or replace function private.kick_email_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.email_config;
begin
  select * into cfg from private.email_config where id = 1;
  if cfg.enabled then
    perform net.http_post(
      url     := cfg.function_url,
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end if;
end;
$$;
revoke all on function private.kick_email_sender() from public;

-- Apunta un correo como pendiente (si ya hay uno pendiente o enviado, no hace nada)
create or replace function private.queue_email(p_reservation uuid, p_type public.email_type, p_recipient text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or trim(p_recipient) = '' then
    return false;
  end if;
  insert into public.email_log (reservation_id, email_type, recipient)
  values (p_reservation, p_type, lower(trim(p_recipient)))
  on conflict (reservation_id, email_type) where status in ('pendiente', 'enviado') do nothing;
  return found;
end;
$$;
revoke all on function private.queue_email(uuid, public.email_type, text) from public;

create or replace function private.reservations_queue_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued boolean := false;
begin
  if tg_op = 'INSERT' and new.source = 'web' then
    queued := private.queue_email(new.id, 'recepcion', new.email) or queued;
    -- El destinatario real del aviso lo decide la función (ADMIN_EMAIL)
    queued := private.queue_email(new.id, 'aviso_admin', 'admin') or queued;
  end if;

  if new.status = 'aceptada'
     and (tg_op = 'INSERT' or old.status is distinct from 'aceptada') then
    queued := private.queue_email(new.id, 'aceptacion', new.email) or queued;
  end if;

  if queued then
    perform private.kick_email_sender();
  end if;
  return null;
end;
$$;

create trigger reservations_queue_emails
  after insert or update of status on public.reservations
  for each row execute function private.reservations_queue_emails();

-- ── Reintentar desde el panel ─────────────────────────────────────────
-- Vuelve a poner en cola un correo que falló y avisa a la función.
create or replace function public.retry_email(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.email_log;
begin
  if not private.is_admin() then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  select * into v_log from public.email_log where id = p_log_id;
  if not found or v_log.status <> 'fallido' then
    raise exception 'Solo se pueden reintentar correos fallidos' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.email_log l
             where l.reservation_id = v_log.reservation_id and l.email_type = v_log.email_type
               and l.status in ('pendiente', 'enviado')) then
    raise exception 'Este correo ya está enviado o en cola' using errcode = 'P0001';
  end if;
  update public.email_log
     set status = 'pendiente', error = null, claimed_at = null
   where id = p_log_id;
  perform private.kick_email_sender();
end;
$$;
revoke all on function public.retry_email(uuid) from public;
grant execute on function public.retry_email(uuid) to authenticated;
