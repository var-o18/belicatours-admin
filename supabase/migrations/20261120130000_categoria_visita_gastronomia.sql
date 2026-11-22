-- =====================================================================
--  Migración 8: nueva categoría «Visita guiada + Gastronomía».
-- =====================================================================

alter table public.activities drop constraint activities_category_check;
alter table public.activities add constraint activities_category_check
  check (category in ('experiencias', 'visitas', 'gastronomia', 'visita_gastronomia'));
