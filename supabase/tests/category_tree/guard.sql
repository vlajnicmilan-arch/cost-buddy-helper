-- SQL čuvar za 0017_category_tree_columns (samo čitanje).
-- Pokrenuti PRIJE i NAKON migracije; svi stupci osim novih moraju dati isti rezultat.
select
  (select count(*) from public.expenses) as expenses_rows,
  (select sum(amount) from public.expenses) as expenses_amount_sum,
  (select md5(string_agg(id::text || coalesce(category,'') || coalesce(type,'') || amount::text, ',' order by id))
     from public.expenses) as expenses_category_type_hash,
  (select count(*) from public.custom_categories) as custom_rows,
  (select md5(string_agg(row(c.id, c.user_id, c.name, c.icon, c.color, c.created_at, c.updated_at)::text, ',' order by c.id))
     from public.custom_categories c) as custom_hash;

-- Samo NAKON migracije: novi stupci prazni na svim postojećim recima.
-- select count(*) from public.expenses where tags <> '{}' or movement_kind is not null;       -- očekivano 0
-- select count(*) from public.custom_categories where group_key is not null;                  -- očekivano 0
-- select name, group_key from public.custom_categories where id = 'ab61e917-645c-465c-94f4-aec2645062e9';
