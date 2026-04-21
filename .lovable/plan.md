

## Problem

Sve izmjene faza (uređivanje, brisanje, status) padaju s greškom:
```
record "new" has no field "user_id"
```

## Uzrok

Database trigger `trg_log_milestone_activity` na tablici `project_milestones` poziva funkciju `log_project_activity()`. Ta funkcija na vrhu radi:
```sql
v_user_id := COALESCE(NEW.user_id, OLD.user_id);
```

Tablica `expenses` ima `user_id` kolonu — radi. Tablica `project_milestones` **nema** `user_id` kolonu — Postgres odbija cijeli statement prije nego dođe do logike.

## Popravak (jedna migracija)

Promijeniti funkciju `log_project_activity()` tako da `user_id` dohvati ovisno o tablici:

- Za `expenses` → `NEW.user_id` (kao i sad)
- Za `project_milestones` → dohvatiti vlasnika projekta iz `projects.user_id` preko `project_id`, jer milestone nema vlastitog autora; ovo je dovoljno za activity log

Logika ostaje ista, mijenja se samo izvor `v_user_id` unutar bloka za `project_milestones`:
```sql
SELECT user_id INTO v_user_id FROM public.projects WHERE id = v_project_id;
```

## Što se NE dira

- Trigger ostaje (koristan je za activity feed)
- Tablica `project_milestones` ostaje bez nepotrebne `user_id` kolone
- Postojeći zapisi u `project_activity_log` ostaju
- RLS politike i ostala logika faza

## Rezultat

Uređivanje, mijenjanje statusa i brisanje faza odmah radi. Activity log nastavlja bilježiti promjene faza pripisane vlasniku projekta.

## Veza s prethodnom temom (nepredviđeni troškovi)

Čim ovo proradi, vraćamo se na tvoja 2 pitanja iz plana za revizije budžeta faza (kategorije promjene + automatska rezerva). Ovaj popravak je preduvjet — bez njega ni postojeće faze ne radi, kamoli proširenja.

