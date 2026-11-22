-- =====================================================================
--  Migración 9: una actividad puede tener varias categorías.
--
--  Ejemplo: una ruta que es «Visita guiada» y «Gastronomía» a la vez
--  aparece en los dos filtros de la web. Sustituye a la categoría
--  combinada «visita_gastronomia» de la migración 8.
--
--  · categories (text[]) es ahora la columna buena, en orden: la primera
--    es la principal.
--  · category se mantiene igual a categories[1] para que las versiones
--    anteriores de la web y del panel sigan funcionando mientras se
--    publican las nuevas.
-- =====================================================================

alter table public.activities add column categories text[];

update public.activities
   set categories = case category
                      when 'visita_gastronomia' then array['visitas', 'gastronomia']
                      else array[category]
                    end;

update public.activities set category = 'visitas' where category = 'visita_gastronomia';

alter table public.activities drop constraint activities_category_check;
alter table public.activities add constraint activities_category_check
  check (category in ('experiencias', 'visitas', 'gastronomia'));

alter table public.activities alter column categories set not null;
alter table public.activities add constraint activities_categories_check
  check (cardinality(categories) between 1 and 3
         and categories <@ array['experiencias', 'visitas', 'gastronomia']::text[]);

-- Mantiene category y categories de acuerdo, quite repetidas y respete el orden
create or replace function private.activities_sync_categories()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.categories is null then
    -- Quien solo manda «category» (versión anterior del panel)
    new.categories := array[new.category];
  elsif tg_op = 'UPDATE'
        and new.category is distinct from old.category
        and new.categories is not distinct from old.categories then
    new.categories := array[new.category];
  end if;

  select array_agg(c order by first_pos)
    into new.categories
    from (select c, min(pos) as first_pos
            from unnest(new.categories) with ordinality as u(c, pos)
           where c is not null
           group by c) d;

  new.category := coalesce(new.categories[1], new.category);
  return new;
end;
$$;

create trigger activities_sync_categories
  before insert or update of category, categories on public.activities
  for each row execute function private.activities_sync_categories();
