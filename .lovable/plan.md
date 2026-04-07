
Problem koji sada stvarno vidim:

- Greška nije više “ne znam gdje puca”, nego je vrlo vjerojatno mismatch između koda u repou i koda koji se stvarno izvršava na telefonu.
- Trenutni source već ima:
  - fallback u `src/lib/secureStorage.ts` na `localStorage`
  - jednostavan `setPin()` u `src/contexts/AppLockContext.tsx` bez stroge read-back provjere
  - toast u `src/components/SetPinDialog.tsx` koji se prikazuje samo ako `await setPin(newPin)` stvarno rejecta
- Po toj verziji koda taj toast bi se trebao događati puno rjeđe nego što ga ti i dalje vidiš.

Do I know what the issue is?

Da — dovoljno da prestanemo naslijepo mijenjati istu PIN logiku.
Najvjerojatniji problem je da instalirana Android aplikacija i dalje vrti stariji bundle / cache, a ne ovu aktualnu verziju sourcea.

Zašto mislim da je to to:
- `SecureStoragePlugin.set({ key, value })` koristi se u ispravnom obliku prema dokumentaciji plugina.
- `secureStorage.ts` sada već hvata native greške i pada natrag na `localStorage`.
- `SetPinDialog.tsx` još uvijek pokazuje samo generički toast, pa ne razlikujemo:
  1. stari bundle na uređaju
  2. stvarni storage error na novom bundleu
- `capacitor.config.ts` pokazuje da native app učitava `https://vmbalance.com`, što uvodi dodatni cache/update sloj.
- `public/version.json` i objavljena domena trenutno obe vraćaju `1.3.4`, pa bez novog bumpa verzije ne možemo lako dokazati je li uređaj stvarno na zadnjoj verziji.

Plan implementacije:

1. Učiniti PIN save flow “samodijagnostičkim”
- U `src/lib/secureStorage.ts` promijeniti API tako da ne vraća samo tihi fallback, nego i podatak:
  - koji backend je korišten (`native` ili `localStorage`)
  - je li native pao
  - koja je stvarna poruka greške
- Time više nećemo pogađati je li pukao plugin ili runtime.

2. Propustiti točne informacije do PIN dijaloga
- U `src/contexts/AppLockContext.tsx` neka `setPin()` vrati jasan rezultat spremanja umjesto “uspjelo/nije uspjelo bez detalja”.
- Pohraniti zadnji storage status u context ili pomoćno stanje za dijagnostiku.

3. Maknuti generičku grešku i pokazati pravi razlog
- U `src/components/SetPinDialog.tsx` zamijeniti generički toast “Greška pri spremanju PIN-a” s preciznijim ishodom:
  - “PIN spremljen u local fallback”
  - “Native secure storage nije dostupan”
  - “Spremanje nije uspjelo”
- Dodati detaljan `console.error` s:
  - `APP_VERSION`
  - `window.location.origin`
  - platformom
  - storage backendom
- Tako ćemo na sljedećem pokušaju odmah znati izvršava li se nova ili stara verzija.

4. Dodati vidljivu runtime dijagnostiku u postavke
- U `src/components/update/RuntimeDiagnostics.tsx` dodati redove za:
  - aktivni origin
  - `APP_VERSION`
  - zadnji PIN storage backend
  - zadnju PIN storage grešku
- Ako je problem stale build, to će biti odmah vidljivo bez novog nagađanja.

5. Bumpati verziju aplikacije uz ovu izmjenu
- U `public/version.json` podići verziju.
- Time native update check konačno može razlikovati staru i novu verziju i pomoći potvrditi da telefon stvarno vrti novi bundle.

Datoteke za doradu:
- `src/lib/secureStorage.ts`
- `src/contexts/AppLockContext.tsx`
- `src/components/SetPinDialog.tsx`
- `src/components/update/RuntimeDiagnostics.tsx`
- po potrebi `src/components/SettingsDialog.tsx`
- `public/version.json`

Tehnički sažetak:
```text
Najvjerojatniji realni problem sada:

Telefon:
native shell
  -> učitava https://vmbalance.com
  -> može imati stariji bundle / cache
  -> zato i dalje vidiš stari generički PIN error

Repo:
SetPinDialog -> AppLockContext.setPin -> SecureStorage.set
                                      -> native try
                                      -> fallback localStorage

Zaključak:
sljedeći korak nije još jedna slijepa promjena PIN logike,
nego ugradnja jasne dijagnostike + bump verzije da točno vidimo
što se stvarno izvršava na uređaju.
```

Očekivani rezultat nakon ove runde:
- odmah ćemo znati je li problem stari bundle ili stvarni storage failure
- prestat će se pojavljivati “ista” greška bez objašnjenja
- ako storage i dalje stvarno puca, imat ćemo točnu poruku i backend koji je korišten, pa će sljedeći fix biti direktan, a ne naslijepo
