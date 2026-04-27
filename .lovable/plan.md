## Sad sam siguran u uzrok

Proučio sam Capacitor `core/dist/capacitor.js` source kod. Plugin proxy izgleda ovako:

```js
new Proxy({}, {
  get(target, prop) {
    switch (prop) {
      case "$$typeof": return;
      case "toJSON": return () => ({});
      case "addListener": return ...;
      case "removeListener": return ...;
      default: return h(prop);  // ← bilo koji property generira "Plugin.prop() is not implemented"
    }
  }
});
```

**Capacitor NEMA filter za `then`.** Kada JavaScript runtime resolve-a Promise koji vraća `Haptics` proxy, mora provjeriti je li thenable — to znači čita `.then` property. Capacitor proxy odgovori: `h("then")` → `"Haptics.then() is not implemented on android"`.

## Gdje točno greška nastaje u našem kodu

`src/hooks/useHaptics.ts`, linije 20-36:

```ts
const getHaptics = async () => {
  // ...
  return HapticsModule;  // ← vraća Capacitor proxy
};

const h = await getHaptics();  // ← JS čita .then na proxy-ju → BUM
```

JavaScript spec za async funkcije: kad async funkcija `return`a objekt, runtime izvršava `Resolve(promise, value)` algoritam koji uključuje `IsCallable(value.then)` — što čita `.then` property. Capacitor proxy zato javlja grešku.

Moj prethodni popravak je samo dodao filter za poruku, ali nije uklonio uzrok — proxy se i dalje vraća iz `async` funkcije.

## Plan popravka

### Datoteka: `src/hooks/useHaptics.ts`

Refaktorirati `getHaptics()` tako da **ne vraća Haptics proxy**. Umjesto toga:

1. **`ensureHapticsLoaded(): Promise<boolean>`** — async funkcija koja samo učita modul i spremi `HapticsModule`, `ImpactStyleEnum`, `NotificationTypeEnum` u module-scoped varijable. Vraća `boolean` (uspjeh/neuspjeh), nikad proxy.

2. **Pozivi koriste cache direktno**:

```ts
const lightTap = async () => {
  if (!(await ensureHapticsLoaded())) return;
  try {
    await HapticsModule.impact({ style: ImpactStyleEnum.Light });
  } catch (e) {
    if (isPluginUnavailableError(e)) hapticsAvailable = false;
  }
};
```

`HapticsModule` se nikad ne pojavljuje kao return value async funkcije — samo se koristi izravno iz module scope-a.

### Datoteka: `src/lib/diagnosticLogger.ts`

Kao defense-in-depth, dodati filter u `unhandledrejection` listener (linije 315-329) da tiho preskoči poznate Capacitor "not implemented" greške:

```ts
if (msg.includes('is not implemented on') || msg.includes('UNIMPLEMENTED')) return;
```

Ovo je standardna praksa — slično kao postojeći filter za `AbortError`.

## Što se NE mijenja

- Javni API (`useHaptics()` vraća `{ lightTap, mediumTap, successVibration, errorVibration }`)
- Sve komponente koje koriste hook (BottomNav, LockScreen, SetPinDialog, TransactionItem, TransferTransactionItem, AddExpenseDialog, ActiveProjectsStrip)
- Web i iOS ponašanje

## Nakon promjene

Nakon publisha, JavaScript runtime više neće čitati `.then` na Haptics proxy-ju jer ga uopće ne vraćamo iz async funkcije. Greška će prestati. Nativna Android aplikacija s Live Sync automatski povlači novi bundle.

## Iskreno priznanje

Prethodno sam dva puta tvrdio "popravljeno" bez dovoljno provjere. Sad imam stvarni dokaz iz Capacitor source koda i znam zašto prethodni popravci nisu radili. Ako i ovaj put greška ne nestane nakon publisha, znači uzrok je u nekom drugom kodu koji await-uje Haptics — ali u tom slučaju filter iz koraka 2 će barem zaustaviti spam u Pulse-u.