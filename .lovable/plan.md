## Što sam našao u logovima

Iz `app_diagnostics_logs` (zadnjih 30 min, tvoja sesija):

1. **`payment_sources_fetch_transient_error`** — ponavlja se ~svakih 1-2 min. Detail: `is_auth: false`, `message: "AbortError: signal is aborted without reason"`. To je upravo "Greška pri dohvaćanju prilagođenih izvora plaćanja".
2. **`previous_boot_crashed`** — 2× kritično. App je padala između sesija.
3. **`add_expense_dialog_unmounted`** — log nakon svakog spremanja (normalno).
4. Auth/postgres logovi nemaju 4xx/5xx → backend je OK, problem je **na klijentu**.

## Root cause

### Bug #1 — `useAuth()` nije singleton (uzrok obje greške)

`src/hooks/useAuth.ts` je obični hook, **ne** Context. U projektu ga zove **91 različitih datoteka**. Svaki poziv:
- kreira **vlastiti** `useState(user)`,
- kreira **vlastitu** `supabase.auth.onAuthStateChange` pretplatu,
- pokreće **vlastiti** `getSession()`.

Posljedica: različite komponente vide `user` na različite trenutke. Tijekom brzog unosa računa (15 zaredom):
- `useExpenseCRUD` instanca u AddExpenseDialog-u može na kratko imati `user = null` dok njena lokalna `getSession()` još nije završila → `if (!user) showError('Moraš biti prijavljen'); return;` → izbacuje na dashboard.
- `useCustomPaymentSources` se mounta prije nego se njegova lokalna auth sesija restoreala → fetch krene s `is_auth:false`, request se aborta kad se hook re-renderuje (deps `user` se promijenila), AbortError se loguje kao "transient" i triger silent retry loop u `setTimeout(800ms)`.

Stack-overflow knowledge u promptu opisuje točno taj race-condition pattern (`useAuthReady`/gating queries na `isReady`).

### Bug #2 — `useCustomPaymentSources` ne razlikuje "abort" od prave greške

U `src/hooks/useCustomPaymentSources.ts` (linije 177-209) catch tretira `AbortError` (request je samo otkazan jer su se deps promijenile) kao "transient error", loguje ga i poziva `setTimeout(fetch, 800)` — što stvara petlju retry-a + diagnostic spam.

Također `loading` početni state (linija 39) ovisi o cache-u, pa komponente koje gate na `loading` vide `false` prerano.

### Bug #3 — `useAuth` postavlja `loading=false` prerano

U `useAuth.ts` linija 20: `setLoading(false)` se zove unutar `onAuthStateChange` **prije** nego `getSession()` završi. Komponente koje koriste samo `loading` (a ne `authReady`) misle da je auth resolvana iako session još nije restorean.

## Plan popravka (architecture, ne patch)

### Korak 1 — `AuthProvider` (singleton auth state)

Pretvori `src/hooks/useAuth.ts` u Context provider:
- Novi `src/contexts/AuthContext.tsx` s **jednom** `onAuthStateChange` pretplatom i **jednim** `getSession()` pozivom.
- Eksponiraj `{ user, session, loading, authReady, signUp, signIn, signOut, ... }` (ista signatura).
- `authReady = true` tek nakon što `getSession()` resolva (ne nakon prvog `onAuthStateChange` eventa).
- Mountaj `<AuthProvider>` u `src/main.tsx` (najviši level, prije `StorageProvider`).

`src/hooks/useAuth.ts` zadrži kao tanki re-export `useContext(AuthContext)` — ne treba dirati 91 datoteku.

### Korak 2 — gate fetcheva na `authReady`

U `useCustomPaymentSources.ts`:
- Dodaj `const { authReady } = useAuth();`
- U `fetchCustomPaymentSources`: `if (!authReady) return;` (ne setLoading(false), ostavi loading dok auth ne resolva).
- Dodaj `authReady` u `useCallback` deps.

Isto mora dobiti **`useExpenseCRUD`** (i ostali write-pathovi koji bacaju "Moraš biti prijavljen"): provjera u `addExpense`/save:
```ts
if (!authReady) {
  // ne radi nista, ne baci toast — dialog ce ostati otvoren, korisnik moze klik ponoviti
  return;
}
if (!user) { showError(...); return; }
```

### Korak 3 — pravilan AbortController u `useCustomPaymentSources`

- Drži `AbortController` u `useRef`, `abort()` na cleanup useEffect-a i prije svakog novog fetcha.
- Proslijedi `signal` u sve `supabase.from(...)` pozive (`.abortSignal(controller.signal)`).
- U catch: ako je `error.name === 'AbortError'` ili `signal.aborted` → tiho `return`, **bez** logiranja u diagnostics i **bez** `setTimeout` retrya. To eliminira diagnostic spam i retry petlju.

### Korak 4 — verifikacija

- Rebuild → otvori preview, prijavi se, brzo unesi 5 računa zaredom.
- Provjeri `app_diagnostics_logs` da `payment_sources_fetch_transient_error` više ne dolazi.
- Provjeri da spremanje računa više ne baca "Moraš biti prijavljen" niti redirecta na dashboard.

## Što NE diram

- Ne mijenjam 91 datoteku koja zove `useAuth()` (re-export iz contexta = drop-in).
- Ne diram backend, RLS, edge funkcije.
- Ne diram `useExpenseCRUD` insert logiku, samo dodajem authReady gate na samom početku save funkcija.
- Bug "previous_boot_crashed" istražim posebno (vjerojatno povezano — kad je app oboren, sljedeći boot to loguje; ako popravak auth race-conditiona stabilizira app, crashevi će vjerojatno nestati). Ako i dalje budu — zaseban krug.
