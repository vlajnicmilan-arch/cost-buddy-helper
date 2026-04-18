

## Uzrok problema

U `src/components/guards/BusinessModeGuard.tsx` postoji guard koji **automatski gasi poslovni način** ako korisnik nema `business_module` pristup. Logika je:

```ts
if (loading) return;  // čeka subscription
if (businessModeEnabled && !hasAccess('business_module')) {
  setBusinessModeEnabled(false);  // GASI poslovni mod
}
```

**Problem**: Kod ponovnog otvaranja aplikacije (osobito nativne/PWA), `SubscriptionContext.checkSubscription()` ima race condition:

1. `useEffect` se okida odmah kad nema `session.access_token` → postavlja `setLoading(false)` i izlazi (red 45-49 u SubscriptionContext.tsx)
2. `tier` ostaje na inicijalnom `'free'`, `trialActive` ostaje `false`
3. `BusinessModeGuard` vidi `loading=false` + `tier='free'` → zaključuje da nema pristupa → **gasi business mode i briše ga iz localStoragea**
4. Sekundu kasnije, kad sesija stigne, subscription se osvježi na pravi tier — ali poslovni mod je već ugašen

Kratko: **guard reagira prebrzo, prije nego što je sesija stvarno učitana**, na temelju lažnog "free" stanja.

Dodatni rizik: čak i pravim Pro/Business korisnicima, ako jedan `check-subscription` poziv padne (mreža, JWT), `tier` može pasti natrag na `free` (red 84-94), a guard bi opet ugasio mod.

## Plan popravka

**1) Popraviti `SubscriptionContext.tsx`**
- Razlikovati "loading" od "resolved": `loading` ostaje `true` dok stvarno ne dobijemo odgovor s backenda. Ako nema sesije, ne postavljati `loading=false` odmah — ostati u "neodređenom" stanju dok se auth ne resolva.
- Kod greške (catch blok) **ne mijenjati** `tier` na free — zadržati prethodnu vrijednost da prolazni mrežni problem ne utječe na pristup.

**2) Pojačati `BusinessModeGuard.tsx`**
- Čekati i `useAuth` (`user` mora postojati) prije bilo kakve odluke.
- Čekati da `subscribed || trialActive` budu jasno utvrđeni — ne gasiti samo na temelju `tier='free'` ako je to možda inicijalna vrijednost.
- Dodati malo "debounce" / sigurnosno kašnjenje (npr. zahtijevati 2 uzastopna ciklusa s "nema pristupa" prije gašenja), tako da prolazni 1. ciklus bez sesije ne ugasi mod.
- Bolje: gasiti **samo** ako je `source` postavljen (`'stripe' | 'admin'`) ili je trial nedvojbeno istekao — što znači da je odgovor stvarno stigao s backenda, a ne da smo na inicijalnim defaultima.

**3) (Opcionalno) Sanity check u `AppStateContext`**
- Pri inicijalnom čitanju `business_mode_enabled` iz localStoragea — ne mijenjati ništa, ali dodati log ako se vrijednost mijenja iz `true` u `false` da se može pratiti uzrok u dijagnostici.

## Rezultat

Nakon popravka:
- Poslovni način ostaje uključen između sesija za Pro/Business korisnike i za korisnike u trialu.
- Guard gasi mod **samo** kad je 100% potvrđeno da korisnik nema pristup (nakon stvarnog odgovora s backenda), ne na osnovu lažnog inicijalnog `free` stanja.
- Otporno na prolazne mrežne greške i spore auth resolve cikluse.

