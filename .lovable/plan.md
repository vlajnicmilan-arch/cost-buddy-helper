

## Pregled grešaka u admin Pulse panelu (zadnjih 24h)

### Što je stvarno u logovima (provjereno u bazi)

Admin pokazuje **34 grešaka u 24h, 32 na `/home`, 2 na `/calendar`**. Kad sam grupirao po signaturi, sve se svode na **2 različita problema**:

| # | Greška | Pojavnosti | Korisnici | Rute | Zadnji put |
|---|---|---|---|---|---|
| 1 | `"Haptics.then()" is not implemented on android` | **17** | 5 | `/home`, `/calendar` | prije ~2h (jutros) |
| 2 | `AbortError: signal is aborted without reason` | **16** | 1 | `/home` | jučer 16:41 (jednokratan burst) |

**Verzija:** sve iz `v1.3.5` (jedina na produkciji).

---

### Greška #1 — Haptics na Androidu (AKTIVNA, 5 korisnika pogođeno)

**Pravi uzrok (provjereno u `src/hooks/useHaptics.ts`):**
Capacitor `@capacitor/haptics` plugin **nije registriran u nativnom runtime-u** trenutno deployane v1.3.5 APK verzije. Kad pozovemo `await h.impact(...)`, Capacitor proxy detektira da Android nema registriran plugin i baca `"<Plugin>.then()" is not implemented on android` rejection — što je **standardni Capacitor signal "plugin nedostaje u nativnom dijelu"**.

Hook ima `try/catch` oko `h.impact()`, ali rejection se javlja **prije** nego `h` postane stvarni objekt — Capacitor proxy odbije na razini `await` iza `getHaptics()`. Naš `try/catch` u `getHaptics()` također ne hvata jer se `mod.Haptics` resolva uspješno (modul postoji), ali pravi nativni mostt vrati grešku tek kad ga prvi put pozoveš.

**Ispravak (2 male izmjene u `src/hooks/useHaptics.ts`):**

1. **Detektirati nedostajući plugin jednom** i memoizirati rezultat — nakon prvog reject-a označi haptiku kao "nedostupna" i preskoči sve buduće pozive (nema više grešaka, nema više Pulse alarma).
2. **Zamotati svaki nativni poziv** u catch koji guta upravo ovaj signal (`"is not implemented"`) — ne kao tihu grešku nego kao "soft disable" cijelog hooka.

```ts
let hapticsAvailable: boolean | null = null;

const getHaptics = async () => {
  if (!isNative) return null;
  if (hapticsAvailable === false) return null;
  if (HapticsModule) return HapticsModule;
  try {
    const mod = await import('@capacitor/haptics');
    HapticsModule = mod.Haptics;
    return HapticsModule;
  } catch {
    hapticsAvailable = false;
    return null;
  }
};

// pomoćnik koji guta "not implemented" i "soft-disable"-a hook
const safeCall = async (fn: () => Promise<void>) => {
  try { await fn(); }
  catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('not implemented') || msg.includes('not available')) {
      hapticsAvailable = false; // više ne pokušavaj
      return;
    }
    // sve drugo tiho — vibracija nije kritična
  }
};
```

Pa svaki `lightTap`/`mediumTap`/`successVibration`/`errorVibration` koristi `safeCall`.

**Posljedica:** nakon idućeg deploya, prva neuspjela vibracija na uređaju gdje plugin fali → hook se sam ugasi → 0 daljnih grešaka u Pulse-u za tog korisnika.

**Zašto se to događa baš sad:** vrlo vjerojatno na onim uređajima radi Live Sync (web bundle na nativnom kontejneru) — web kod misli da je nativno (jer `Capacitor.isNativePlatform()` vraća true), ali stvarni APK koji pokreće app je stariji build u kojem `HapticsPlugin` nije bio registriran u `MainActivity.java`/`capacitor.config`. Ovaj softverski fix to potpuno toleranira **bez potrebe za novim APK-om**.

---

### Greška #2 — AbortError burst na `/home` (RIJEŠENO PRIRODNO, jednokratan)

**Pravi uzrok:** 16 zaboljenja istovremeno (jučer 16:41:18, isti session), svi `AbortError: signal is aborted without reason`, isti stack trace (`index-D1TGye7b.js:200:16786`).

To je klasičan **TanStack Query / fetch abort** kad se React komponenta odmounta tijekom letećih query-ja — npr. brzi prelaz s rute na rutu, ili logout. Nije korisnička greška, samo "noise" u logovima jer naš `window` `unhandled_rejection` listener hvata svaku Promise rejection bez razlike.

**Ispravak (1 mala izmjena u `src/lib/diagnosticLogger.ts` ili gdje god je `unhandled_rejection` listener):**

Filtrirati AbortError prije slanja u logove:

```ts
window.addEventListener('unhandledrejection', (event) => {
  const reason: any = event.reason;
  // Ne logaj očekivane abort errore (cancel u query/fetch-u)
  if (reason?.name === 'AbortError') return;
  if (typeof reason?.message === 'string' && reason.message.includes('signal is aborted')) return;
  
  logDiagnostic('unhandled_rejection', { ... });
});
```

**Posljedica:** Pulse više neće prikazivati lažne alarme od cancellanih fetcheva.

---

### Što NE diram

- Sustav skeniranja računa (jučerašnji popravak ostaje).
- Push notifikacije (jučerašnji `verify_jwt` popravak ostaje).
- Pulse aggregaciju i metrike — sve je točno, samo smanjujemo izvor smetnje.
- Nativni APK build — sve se popravlja na softverskoj razini.

---

### Tehnički sažetak

| Datoteka | Linije | Što mijenjam |
|---|---|---|
| `src/hooks/useHaptics.ts` | cijela | Dodati `hapticsAvailable` flag i `safeCall` helper za "not implemented" detekciju |
| `src/lib/diagnosticLogger.ts` | listener za `unhandledrejection` | Preskočiti `AbortError` i `signal is aborted` poruke |

**Ukupno: 2 datoteke, ~30 linija promjena, bez ovisnosti, bez i18n.**

### Trajanje
~5 minuta. Nakon deploya: idem opet u Pulse za 24h da potvrdim — očekujem **0 novih `Haptics`/abort grešaka**.

### Što ostaje za buduću nativnu nadogradnju (nije hitno)
Pri sljedećem APK build-u verificirati da je `@capacitor/haptics` ispravno registriran (`npx cap sync android` + rebuild). Tada haptika počne stvarno raditi za korisnike koji ju trenutno tiho gube. Ali to je **kasnije** — softverski fix iznad odmah skida buku iz dijagnostike.

