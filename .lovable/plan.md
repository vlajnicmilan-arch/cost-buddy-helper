# Fix: "failed to send request" pri povezivanju računa s izvorom

## Dijagnoza

Edge funkcije `bank-link-account` i `bank-sync-transactions` postoje u repou (`supabase/functions/...`) ali **NISU deployane** na Cloud:

- `POST /bank-link-account` → `404 NOT_FOUND` ("Requested function was not found")
- `POST /bank-connect-start` (postojeća) → `401` (radi, samo nema auth)

Frontend (`OpenBankingPanel.tsx:177`) zove `supabaseInvoke('bank-link-account', ...)` što baca generičku grešku "failed to send request" jer endpoint vraća 404 prije nego se odgovor parsa kao JSON.

Najvjerojatniji uzrok: deployment iz prethodne iteracije se silently zarolao (npr. zbog `npm:@supabase/supabase-js@2/cors` subpath-a koji u nekim Deno verzijama ne resolva, iako radi u `bank-connect-start`). Treba redeploy.

## Plan

1. **Redeploy obje funkcije** s istim sadržajem koji je već u repou:
   - `supabase/functions/bank-link-account/index.ts`
   - `supabase/functions/bank-sync-transactions/index.ts`

2. **Verifikacija**: nakon deploya curl `POST /bank-link-account` mora vratiti **401** (unauthorized bez tokena), ne 404.

3. **Ako redeploy padne** — fallback na lokalnu CORS deklaraciju umjesto `npm:@supabase/supabase-js@2/cors` importa (replicirati pattern iz npr. `bank-list-aspsps`).

4. **Frontend dodatak (opcionalno)**: u `OpenBankingPanel.tsx` poboljšati error handling — umjesto "failed to send request" prikazati `error.message` ili HTTP status iz `supabaseInvoke` response-a, da se ovakve situacije lakše dijagnosticiraju ubuduće.

## Bez izmjena

- DB migracija je već primijenjena (kolone `linked_payment_source_id`, `bank_transaction_id` itd. postoje).
- UI logika u `OpenBankingPanel.tsx` je ispravna.
- Sva i18n je na mjestu.

## Sljedeći korak nakon fixa

Test: Spoji → Kreiraj novi izvor / Odaberi postojeći → Sinkroniziraj. Trebao bi proći bez greške.
