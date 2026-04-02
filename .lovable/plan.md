

## Plan: Otpornost na istekle tokene

### Problem
JWT token može isteći između dva auto-refresh ciklusa (Supabase refresh interval). U tom kratkom prozoru, svi API pozivi failaju i korisnik vidi toast greške za izvore plaćanja i troškove.

### Rješenje

#### 1. SubscriptionContext — koristiti svjež token
**`src/contexts/SubscriptionContext.tsx`**
- Umjesto `session.access_token` (koji može biti stale), pozvati `supabase.auth.getSession()` neposredno prije invoke-a da se dobije najsvježiji token
- Dodati graceful error handling: ako edge funkcija vrati 500 s "expired", ne prikazivati grešku korisniku, samo retry na sljedećem ciklusu
- Smanjiti retry interval na razumnu vrijednost ili dodati exponential backoff

#### 2. useExpenseFetch — dodati retry na auth error
**`src/hooks/useExpenseFetch.ts`**
- U `fetchExpenses` catch bloku: ako je greška vezana uz auth (401/JWT), pokušati `supabase.auth.refreshSession()` pa retry jednom
- Ne prikazivati toast za auth-related greške (prolazne su)

#### 3. useCustomPaymentSources — isti retry pattern
**`src/hooks/useCustomPaymentSources.ts`**
- Isti pristup: retry jednom nakon auth greške prije prikazivanja toasta korisniku

#### 4. Pomoćna funkcija za retry
**`src/lib/utils.ts`** (ili nova datoteka `src/lib/supabaseRetry.ts`)
- Kreirati zajedničku `withAuthRetry(fn)` wrapper funkciju koja:
  1. Izvršava fn()
  2. Ako dobije auth grešku, pozove `supabase.auth.refreshSession()`
  3. Retry fn() jednom
  4. Ako opet padne, tek tada throwaj

### Datoteke za izmjenu
- `src/contexts/SubscriptionContext.tsx`
- `src/hooks/useExpenseFetch.ts`
- `src/hooks/useCustomPaymentSources.ts`
- `src/lib/utils.ts` (ili nova pomoćna datoteka)

### Rezultat
Povremene greške pri isteku tokena više neće biti vidljive korisniku — sustav ih tiho rješava retry-em.

