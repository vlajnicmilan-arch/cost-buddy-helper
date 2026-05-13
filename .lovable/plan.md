## Cilj

Spojiti jednu test banku preko Enable Banking sandboxa i prikazati listu računa unutar V&M Balance aplikacije. Bez sinkronizacije transakcija u `expenses` (to ide u Fazu 2).

---

## Što gradimo

### 1. Lovable Cloud secrets
- `ENABLE_BANKING_APP_ID` = `d5f12f1e-7523-4e11-9977-63d4ba90c057`
- `ENABLE_BANKING_PRIVATE_KEY` = sadržaj .pem datoteke (paste-aš ga u secret formu, ne ide u kod)

### 2. Database (1 migracija)

**Tablica `bank_connections`** — jedna konekcija = jedna banka koju je korisnik autorizirao:
- `user_id`, `business_profile_id` (nullable, za business kontekst kasnije)
- `provider` ('enable_banking'), `aspsp_name`, `aspsp_country`
- `session_id` (Enable Banking session UUID), `valid_until` (PSD2 max 180 dana)
- `status` ('pending' | 'active' | 'expired' | 'revoked')

**Tablica `bank_accounts`** — računi unutar konekcije:
- `connection_id` (FK), `account_uid` (Enable Banking ID), `iban`, `name`, `currency`, `balance`, `balance_updated_at`
- `linked_payment_source_id` (nullable FK na `custom_payment_sources`, za buduće mapiranje)

RLS: vlasnik (user_id) puni pristup; bez sharinga zasad.

### 3. Edge functions (3 nove)

**`bank-connect-start`** (POST, autentificiran)
- Input: `{ aspsp_name, aspsp_country, language }`
- Generira JWT (RS256) potpisan privatnim ključem → poziva Enable Banking `POST /auth`
- Vraća `{ authorization_url, session_state }`
- Klijent otvara `authorization_url` (browser/Capacitor Browser plugin)

**`bank-connect-complete`** (GET, **public** — verify_jwt = false)
- Ovo je redirect URL koji već imaš registriran
- Prima `?code=...&state=...` od banke
- Razmijeni `code` za `session_id` preko Enable Banking `POST /sessions`
- Upiše `bank_connections` + `bank_accounts` (preko service role, jer user nije nužno logiran u edge kontekstu)
- Vraća HTML stranicu s deep linkom natrag u app (`vmbalance://bank-connected` za native, `/wallet?bank_connected=1` za web)

**`bank-list-aspsps`** (GET, autentificiran)
- Cache lista banaka po zemlji (Enable Banking `GET /aspsps?country=HR`)
- Sandbox vraća test banke; kasnije u produkciji vraća HR banke

### 4. Frontend (minimalno)

**Postojeća komponenta `BankConnection.tsx`** (već je u `/wallet`) — proširimo je s novom sekcijom **"Spoji banku (Open Banking)"** iznad postojećeg CSV importa:

- Gumb **"Spoji banku"** → otvara dialog
- Dialog korak 1: dropdown s listom banaka (iz `bank-list-aspsps`)
- Dialog korak 2: na klik "Nastavi" → poziv `bank-connect-start` → otvori `authorization_url`
- Nakon redirecta nazad → toast "Banka spojena", refresh
- Lista spojenih banaka ispod gumba: naziv banke, broj računa, valid_until, "Prekini vezu" gumb

Sve nove stringove dodajemo u `src/i18n/locales/{hr,en,de}.ts` pod namespace `bankConnection.*`.

### 5. Što NE radimo u ovoj fazi
- Sinkronizacija transakcija u `expenses`
- Mapiranje `bank_accounts` ↔ `custom_payment_sources`
- Auto-refresh balansa
- Webhook za consent expiry
- Production HR banke (čekamo Enable Banking sales odgovor)

---

## Tehnički detalji (za referencu)

**JWT signing:** Enable Banking traži RS256 JWT s `iss=app_id`, `aud="api.enablebanking.com"`, `iat`, `exp`. Koristimo `jose` Deno modul (`npm:jose@5`) za potpisivanje.

**Redirect URL u kodu:** `https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/bank-connect-complete` (već registriran u Enable Banking dashboardu).

**Sandbox banke:** Enable Banking sandbox koristi mock banke (Nordea sandbox, Mock ASPSP iz Enable Banking dashboarda) — nema HR banaka, ali API model je identičan.

**State parametar:** Generiramo random UUID, spremamo u `bank_connections.session_id` placeholder + `user_id` preko service role pri `connect-start`, validiramo u `connect-complete`.

---

## Redoslijed izvršavanja

1. Korisnik dodaje 2 secreta (`ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY`)
2. Migracija (`bank_connections` + `bank_accounts` + RLS)
3. Edge functions (`bank-list-aspsps`, `bank-connect-start`, `bank-connect-complete`)
4. UI sekcija u `BankConnection.tsx` + i18n
5. Test: spoji sandbox banku → provjeri da se računi pojave u listi

---

## Procjena
~1 dan rada (4-6 sati implementacije + 1-2h testiranja sandbox flowa).
