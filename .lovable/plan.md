## Enable Banking — prijelaz na produkciju: analiza + prijedlog

### 1. Kako auth radi sada

`supabase/functions/_shared/enableBankingJwt.ts`:
- Čita **dvije** tajne iz Deno env-a:
  - `ENABLE_BANKING_APP_ID` (→ ide u JWT header `kid`)
  - `ENABLE_BANKING_PRIVATE_KEY` (PKCS#8 PEM, RS256)
- Bazni URL je **hard-kodiran**: `https://api.enablebanking.com`
- JWT: `iss=enablebanking.com`, `aud=api.enablebanking.com`, `exp=+1h`
- Sve bank edge funkcije (`bank-list-aspsps`, `bank-connect-start`, `bank-connect-complete`, `bank-link-account`, `bank-sync-transactions`) idu kroz `ebFetch()` → koriste **isti par tajni**.

**Zaključak:** JEDAN set tajni. Nema sandbox/prod razdvajanja u kodu.

### 2. Base URL

Isti host `api.enablebanking.com` služi i sandbox i produkciju kod Enable Bankinga — okruženje se određuje isključivo prema `APP_ID` (koji ključ je registriran za koju aplikaciju). Nema env flaga i **ne treba ga**.

### 3. Hard-kodiran FI

Dva mjesta:
- **Backend** `supabase/functions/bank-list-aspsps/index.ts:33` — default `"FI"` ako klijent ne pošalje `?country=`.
- **Frontend** `src/components/OpenBankingPanel.tsx`:
  - `useState('FI')` (linija 46)
  - `COUNTRIES_SANDBOX` lista (linije 27–32): FI/EE/LV/LT (samo sandbox zemlje, **HR nije u listi**).

Za HR banke: dodati `HR` u dropdown listu i promijeniti default na `HR`. UI izbor već postoji, samo su opcije ograničene na sandbox tržišta. Backend default (`"FI"`) manje bitan jer frontend uvijek šalje `?country=`.

### 4. Strategija — preporuka: **Opcija A (zamjena tajni)**

- **Opcija A** — zamijeni `ENABLE_BANKING_APP_ID` i `ENABLE_BANKING_PRIVATE_KEY` produkcijskim vrijednostima. Sandbox prestaje raditi.
- **Opcija B** — dodaj `ENABLE_BANKING_PROD_*` + env flag → treba kod-promjene u `enableBankingJwt.ts` (odabir seta), rizik konfuzije, više tajni za rotirati.

**Preporuka:** Opcija A. Razlozi:
- Milan solo ide na prave račune, sandbox mu ne treba za dnevni rad.
- Nula kod-promjena u auth sloju.
- Rollback = vratiti stare sandbox tajne kad bude trebalo testirati.
- Sandbox aplikacija (`d5f12f1e…`) ostaje Active u Enable Bankingu — ako ikad treba, tajne se ponovno mogu zamijeniti.

### 5. Točan popis tajni za Supabase (Project Settings → Secrets)

Milan mijenja vrijednosti za dvije postojeće tajne:

| Ime tajne | Nova vrijednost |
|-----------|-----------------|
| `ENABLE_BANKING_APP_ID` | `ef3e7b6f-b54c-45ea-9c56-737d14ea899c` (produkcijski APP_ID "Centar production") |
| `ENABLE_BANKING_PRIVATE_KEY` | Produkcijski PKCS#8 PEM privatni ključ (cijeli blok s `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`) |

Ništa novo se ne dodaje. Nakon spremanja, edge funkcije automatski povuku nove vrijednosti na sljedeći poziv (nema deploya).

### 6. Sigurnost bankovnih podataka (RLS)

Provjereno u živoj bazi:

- `bank_connections` — SELECT/UPDATE/DELETE: `auth.uid() = user_id`; INSERT bez `WITH CHECK` (edge funkcija koristi user token pa piše samo za sebe, ali **preporuka je dodati `WITH CHECK (auth.uid() = user_id)`** za oba INSERT-a).
- `bank_accounts` — isti obrazac, ista rupica na INSERT-u.
- Nema odvojene `bank_transactions` tablice — sinkronizirane transakcije završavaju u `expenses` (via `linked_payment_source_id`), koji već ima strogi RLS.

**Napomena:** INSERT bez `WITH CHECK` je klasa (a) sitna rupa (autentificirani korisnik bi teoretski mogao insertati red s tuđim `user_id` direktno preko PostgREST-a). Ne blokira produkciju za solo račune, ali vrijedi zatvoriti kad bude prilika (odvojena mikro-migracija).

### Što u kodu treba promijeniti (kad Milan kaže "gradi")

Minimalno, samo frontend:

1. **`src/components/OpenBankingPanel.tsx`**
   - Dodati `HR` u listu zemalja (i preimenovati konstantu, npr. `COUNTRIES` bez sufiksa `_SANDBOX`), po potrebi dodati i druge EU zemlje (SI, AT, DE) — Milanova odluka.
   - Promijeniti default `useState('FI')` → `useState('HR')`.
   - i18n labeli (bez "(sandbox)" oznake).

2. **`supabase/functions/bank-list-aspsps/index.ts:33`** (opcionalno)
   - Default `"FI"` → `"HR"`. Kozmetika; frontend uvijek šalje eksplicitni parametar.

**Nula dodira:** `enableBankingJwt.ts`, ostale bank edge fn, balance/settlement logika, migracije, RPC.

### Otvoreno pitanje za Milana

- Koje zemlje treba u dropdownu? Samo **HR**, ili **HR + EU susjedi** (SI, AT, DE, IT)? Enable Banking pokriva praktički sve EU tržište; sužavanje na HR je najjednostavnije, više zemalja daje fleksibilnost bez dodatnog troška.

Plan je prijedlog. Čekam odobrenje prije koda.