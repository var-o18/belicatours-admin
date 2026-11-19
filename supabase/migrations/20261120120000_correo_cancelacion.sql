-- =====================================================================
--  Migración 7: motivo de cancelación y correo al cliente.
--
--  Al cancelar desde el panel se puede escribir un motivo y elegir si se
--  avisa al cliente. Si se avisa, se envía el correo «cancelacion» con
--  ese motivo.
-- =====================================================================

alter type public.email_type add value if not exists 'cancelacion';

alter table public.reservations
  add column cancel_reason text check (length(cancel_reason) <= 1000),
  add column cancel_notify boolean not null default true;

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

  if new.status = 'pagada'
     and (tg_op = 'INSERT' or old.status is distinct from 'pagada') then
    queued := private.queue_email(new.id, 'confirmacion', new.email) or queued;
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelada' and old.status is distinct from 'cancelada'
     and new.cancel_notify then
    queued := private.queue_email(new.id, 'cancelacion', new.email) or queued;
  end if;

  if queued then
    perform private.kick_email_sender();
  end if;
  return null;
end;
$$;
