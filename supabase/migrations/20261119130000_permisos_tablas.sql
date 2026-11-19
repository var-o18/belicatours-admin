-- =====================================================================
--  Migración 2: permisos de tabla explícitos.
--  Los proyectos nuevos de Supabase ya no dan acceso automático a las
--  tablas a los roles de la API. RLS sigue decidiendo qué FILAS se ven;
--  esto solo decide qué OPERACIONES puede intentar cada rol.
-- =====================================================================

-- Público (web sin login): solo lectura del catálogo publicado
grant select on public.activities, public.activity_images, public.activity_sessions to anon;

-- Usuarios con sesión (el panel). RLS limita todo al rol admin.
grant select, insert, update, delete on
  public.activities, public.activity_images, public.activity_sessions, public.reservations
  to authenticated;
grant select on public.reservation_events, public.email_log, public.user_roles to authenticated;
grant select, update on public.payment_settings to authenticated;

-- Funciones de servidor (Edge Functions con service role: envío de correos)
grant all on all tables in schema public to service_role;
