---
name: Usmjeravanje mail dokumenata po OIB-u
description: scope_type po vlastitom OIB-u u dokumentu, chip/korekcija odredišta, scope_set_by_user, meka dedup najava, reprocess za zavrsene poruke
type: feature
---
- Usmjeravanje: `supabase/functions/_shared/mailImport/scopeRouting.ts` (`resolveScope`) — točno 1 vlastiti OIB u tekstu (nakon uklanjanja IBAN-a) → `business_profile` + profileId; 0 → `user`; ≥2 → `user` + upozorenje `vise_vlastitih_oib`. Računa se JEDNOM po jedinici u `mail-process`, prije transportnog dedupa.
- `ownOibsFor` vraća `{oib, profileId}[]`; goli `ownOibs` je IZVEDEN iz nje — jedan izvor istine.
- Atribucija NEDIRNUTA: `owner_user_id`, kvota, obavijesti uvijek ostaju vlasnik aliasa.
- Korisnikova korekcija = ODLUKA: RPC `mail_item_set_scope` postavlja `document_ingest_items.scope_set_by_user=true`; `ingestItemUpsert` tada NE piše `scope_type/scope_id` (ekstrakcija se i dalje osvježava). Čuvar: `src/test/mailScopePersistsReprocess.test.ts`.
- Meka dedup najava: `softDuplicate.ts` (`vjerojatno_duplikat`) — samo upozorenje, nikad automatika.
- Reprocess: transportni dedup izuzima istu poruku (`.neq('message_id', ...)`); `mail_ingest_retry_message` prima i status `zavrsena` (UI: „Ponovno obradi" u tabu Primljeno).
