# Odgovori o E2E ključevima + prijedlog jeftinije zamjene

## 1. Jesu li varijable stvarni uvjet? Da.

Čitaju se kodom (ne samo dokumentacijom):

- `e2e/security/helpers/env.ts:8-11` — `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_USER_PASSWORD`, sve kroz `required()` (`e2e/security/helpers/env.ts:1-5`) koji baca grešku ako varijabla fali.
- `e2e/helpers/env.ts:13-16` — isto, za funkcijske (ne-sigurnosne) E2E tokove.

Gdje se koriste:
- `e2e/security/helpers/clients.ts:7` (service-role admin klijent), `:22-27` (prijava sintetičkog usera anon ključem + lozinkom), `:40-49` (pozivi edge funkcija).
- `e2e/security/helpers/users.ts:6-34` — kreiranje/reset `security+a@` i `security+b@` korisnika preko admin API-ja (traži service_role).

Dakle nije nasljeđe: bez ta 4 podatka `global-setup` padne prije prvog testa.

## 2. Je li GitHub jedini put? Ne, ali GitHub je najlakši.

- `.github/workflows/security-audit.yml` — jedini workflow koji pokreće `bun run test:security` (`:44`). Okidač je **samo `workflow_dispatch`** (`:12-13`), tj. ručno iz GitHub → Actions.
- Bitno: taj workflow **već ima fallback vrijednosti** za URL (`:27`) i anon ključ (`:28`) hardkodirane u datoteci, i fallback lozinku (`:32`). Jedini secret koji *stvarno* mora postojati je **`E2E_SUPABASE_SERVICE_ROLE_KEY`** (`:29`).
- `.github/workflows/e2e.yml` je funkcijski paket i namjerno je isključen (`:8-9`, komentar `:3-6`).

Lokalna alternativa: `npm run test:security` (`package.json:17`) s izvezenim varijablama — vidi `e2e/security/README.md:8-14`. Nema `.env` učitavanja u toj konfiguraciji (`playwright.security.config.ts` ne poziva dotenv), pa varijable moraju biti u okruženju procesa (`export ...` ili `VAR=... npm run test:security`). I dalje treba isti service_role ključ.

Zaključak: GitHub nije jedini put, ali **service_role ključ je neizbježan** u oba puta.

## 3. Odakle ključevi?

- **anon ključ**: nije tajna, već je u repozitoriju — `.env:2` (`VITE_SUPABASE_PUBLISHABLE_KEY`) i hardkodiran u `.github/workflows/security-audit.yml:28`. Korisnik ga ne mora tražiti.
- **URL**: `.env:3`. Isto, ne mora se tražiti.
- **E2E_USER_PASSWORD**: bilo koji jak string koji korisnik sam izmisli; odnosi se na sintetičke `security+a/b@vmbalance.com` korisnike, ne na prave.
- **service_role ključ**: **Lovable Cloud ga ne prikazuje korisniku.** Na Lovable Cloud projektima service_role ključ i lozinka baze nisu dostupni kroz sučelje — nema ekrana „Backend → API keys" s tom vrijednošću. Dokumentacija u repou (`docs/E2E_TESTING.md:94`) tvrdi suprotno i **netočna je**; to je razlog zašto korisnik ništa nije našao. Ključ bi bio vidljiv samo vlasniku pravog Supabase projekta u Supabase dashboardu, čega ovdje nema.

## 4. Mogu li ja pokrenuti paket? Ne.

Provjereno u ovom okruženju:
- Nema nijedne `E2E_*` varijable.
- Nema service_role ključa među projektnim secretima (popis: Paddle, Gemini, FCM, Sudreg, Sentry, Enable Banking, itd. — service_role nije među njima i nije dostupan).
- Direktna DB veza postoji (`SUPABASE_DB_URL`), ali kao rola `sandbox_exec`, a `SET ROLE authenticated` je odbijen (`permission denied to set role "authenticated"`). SQL alat za čitanje radi kao `supabase_read_only_user`, također bez prava mijenjanja role.

Zato **ne mogu izvršiti `npm run test:security` ni pojedinačni spec**, ni s kojim skupom kredencijala. Bez zaobilaznice.

## 5. Jeftinija zamjena — postoji, ali je slabija

Moguć je SQL harness po uzoru na `supabase/tests/balance/` i `supabase/tests/security/secdef_anon_invariant.sql`, koji se pokreće u CI-u nad praznim Postgresom (`.github/workflows/balance-sql-suite.yml` — postgres:16 servis, bez ijednog secreta). Matrica uloga se glumi s:

```text
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- pokušaj UPDATE/INSERT, provjeri SQLSTATE 42501 ili 0 pogođenih redaka
ROLLBACK;
```

Što bi dokazalo: RLS politike i triggeri na `project_milestones`, `projects`, revizijama, aneksima, dokumentima, checklistama, radnicima i članstvima — isti stupci i isti razlog odbijanja (42501 vs. greška sheme) kao u specu 09.

Čega **ne** bi dokazalo (i zato je slabije):
- pravi JWT put kroz PostgREST — `set_config` ručno postavlja ono što GoTrue inače potpisuje; propust u izdavanju tokena ili u `auth.uid()` mapiranju ne bi se vidio;
- PostgREST sloj: `return=representation`, grants na role, izloženost stupaca kroz API;
- edge funkcije (specovi 06, dio 04) — one se zovu HTTP-om s korisnikovim tokenom;
- ponašanje na **živoj** bazi s pravim podacima; harness ide nad kuriranom baznom shemom, pa drift između migracija i produkcije ostaje nepokriven.

Procjena: pokriva otprilike RLS/trigger dio matrice (najveći dio koraka D), ne pokriva transportni i auth sloj. Kao *dodatni* gate je koristan; kao *zamjena* za `test:security` je djelomičan.

## Što predlažem da odlučimo

1. **Najjeftinije i najtočnije**: korisnik u GitHubu doda samo jedan secret — `E2E_SUPABASE_SERVICE_ROLE_KEY` — i ručno pokrene „Security Audit (adversarial)". Ostala tri već imaju fallback. Ali ključ mora doći iz Supabase projekta; ako Lovable Cloud njime upravlja, korisnik ga nema i ovaj put je zatvoren.
2. **Ako ključ nije dostupan**: izgraditi SQL harness `supabase/tests/security/role_write_matrix.sql` + korak u postojećem CI workflowu, uz jasno dokumentirano što ne pokriva.
3. Neovisno o izboru: ispraviti netočnu uputu u `docs/E2E_TESTING.md:94`.

Reci koju opciju gradim (1, 2, ili 2+3) i krećem.
