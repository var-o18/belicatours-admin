-- =====================================================================
--  Migración 6: correo de «reserva confirmada» al recibir el pago.
--
--  Flujo de correos al cliente:
--    · recepcion    → al reservar en la web: «Hemos recibido tu solicitud»
--    · aceptacion   → al pasar a «aceptada»: «Tenemos plaza · completa el pago»
--    · confirmacion → al pasar a «pagada»:   «Reserva confirmada»
-- =====================================================================

alter type public.email_type add value if not exists 'confirmacion';

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

  if queued then
    perform private.kick_email_sender();
  end if;
  return null;
end;
$$;
