## Provjera grešaka iz Pulse-a

Provjerio sam `app_diagnostics_logs` tablicu (klijentske greške) i pronašao 2 stvarna problema:

### ✅ 1. "Rendered more hooks than during the previous render" — VEĆ POPRAVLJENO
Greška je iz `ActiveProjectsStrip.tsx:65` od prije 35 min. Pregledom trenutnog koda vidim da su svi hooks već ispravno pozvani **prije** bilo kakvog `return null` (komentar na liniji 78 to potvrđuje). Ovo je popravljeno u prethodnom turn-u, samo su logovi stari.

### 🔧 2. "Haptics.then() is not implemented on android" — TREBA POPRAVITI
Pojavljuje se mnogo puta na `/wallet`, `/home`, `/projects`. Uzrok: Android build aplikacije nema registriran `@capacitor/haptics` plugin u nativnom bridge-u, pa Capacitor proxy detektira `.then` access (jer je Promise thenable) i baca grešku **prilikom poziva metode** (`h.impact(...)`), ne prilikom `import()`. Trenutni `safeCall` u `useHaptics.ts` štiti samo poziv metode, ali greška se može propagirati i kroz import/inicijalizaciju enuma.

## Rješenje

**Datoteka:** `src/hooks/useHaptics.ts`

Refaktor koji:

1. **Sav async kod (uključujući `getHaptics()` i import enuma) zamota u jedan `safeRun` wrapper** — trenutni kod ima `getHaptics()` van `safeCall`-a, pa greške iz inicijalizacije nisu uhvaćene.

2. **Cache-aju se i `ImpactStyle` i `NotificationType` enumi** pri prvom uspješnom importu, pa se izbjegava ponovno dinamičko importanje pri svakom pozivu.

3. **Dodaje se `'Haptics.then'` u `isPluginUnavailableError`** — kad detektira tu specifičnu poruku, trajno gasi haptics za cijelu sesiju (`hapticsAvailable = false`), pa se greška ne ponavlja na svakom tap-u.

4. **Sve greške ostaju tihe** (haptics su non-critical) — ne logiraju se više u `unhandled_rejection` jer su uhvaćene unutar try/catch.

### Što se ne mijenja

- Javni API ostaje isti: `useHaptics()` vraća `{ lightTap, mediumTap, successVibration, errorVibration }`
- Sve postojeće komponente (`BottomNav`, `LockScreen`, `SetPinDialog`, `TransactionItem`, `TransferTransactionItem`, `AddExpenseDialog`, `ActiveProjectsStrip`) rade bez izmjena
- Web fallback (na browseru) ostaje no-op
- Na Androidu/iOS gdje plugin radi — vibracije i dalje rade normalno

## Rezultat

Nakon promjene, `unhandled_rejection` greške s porukom `"Haptics.then() is not implemented on android"` neće se više pojavljivati u Pulse-u jer će biti tiho uhvaćene i plugin će se trajno disable-ati za sesiju nakon prve takve greške.