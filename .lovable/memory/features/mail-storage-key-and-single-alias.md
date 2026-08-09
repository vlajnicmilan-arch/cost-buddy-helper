---
name: Mail uvoz — ključ pohrane i jedan aktivan alias
description: ASCII-siguran storage ključ (Račun.pdf → InvalidKey), prevelik privitak vidljiv, get-or-create alias + unique aktivan po korisniku
type: feature
---
- Ključ u bucketu `inbound-mail` NIKAD ne smije sadržavati sirovo ime datoteke. `supabase/functions/_shared/mailImport/storageKey.ts` → `sanitizeStorageSegment()`. Uzrok kvara 9.8.2026.: "Račun.pdf" → Storage `InvalidKey` 400 → 500 → Mailgun ponavlja → poruka nikad ne nastane.
- Prevelik privitak (> `MAX_TOTAL_BYTES` 15 MB) se NE odbacuje s 413: privitak se bilježi `incomplete=true, quarantine_reason='privitak_prevelik'`, poruka se sprema s `last_error='privitak_prevelik'` (status `zaustavljena_branom`, ručni retry moguć). Tvrda granica parsiranja je 40 MB.
- Alias: najviše JEDAN aktivan po korisniku (`uniq_mail_alias_active_per_user`). Klijent NIKAD ne inserta izravno — RPC `mail_alias_get_or_create()` i `mail_alias_regenerate()`. Pri sanaciji preživljava NAJSTARIJI aktivan (korisnik ga već koristi i Mailgun na njega ponavlja dostavu).
- Čuvar: `src/test/mailIngestAliasAndKey.test.ts`.
