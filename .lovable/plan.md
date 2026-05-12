## Problem

Vinkin APK pri svakom pokušaju updatea (1.0.5 → 2.0.1 → 2.0.2) javlja telemetriji:
```
update_download_failed: "Browser" plugin is not implemented on android
```

`apkInstaller.ts` koristi `Browser.open()` iz `@capacitor/browser` da pokrene APK download preko system browsera. U njenom instaliranom APK-u taj plugin nije registriran u native `BridgeActivity` — vjerojatno jer je Browser plugin dodan u `package.json` *nakon* što je njen trenutni APK buildan, ili `cap sync` nije bio pokrenut na toj iteraciji.

Posljedica: korisnici sa starijim APK-ovima (svi koji su ikad imali ovaj problem) **ne mogu se nikad više auto-updateati** jer svaki pokušaj zahtijeva Browser plugin koji ne postoji.

## Rješenje (dva sloja)

### Sloj 1 — robustan fallback u `apkInstaller.ts` (za buduće verzije)

Umjesto da slijepo zovemo `Browser.open()`, napravi sekvencu:

1. **Pokušaj 1:** `window.open(apkUrl, '_system')` — Capacitor WebView ovo prepoznaje kao external intent i prosljeđuje sistemu. Ne ovisi ni o jednom pluginu.
2. **Pokušaj 2 (fallback):** kreiraj `<a href={apkUrl} download>` element, dodaj u DOM, klikni, ukloni. Trigerira Android Download Manager.
3. **Pokušaj 3:** `Browser.open()` (postojeća implementacija) — samo ako prva dva ne uspiju.

Telemetrija (`update_install_intent_launched` / `update_download_failed`) zadržava se i prijavljuje koji je sloj uspio (`strategy: 'window_system' | 'anchor' | 'browser'`).

Ovo eliminira ovisnost o registraciji jednog plugina i radi na svim Android verzijama.

### Sloj 2 — jednokratni izlaz za Vinku (i sve "zaglavljene" korisnike)

Vinkin trenutni APK NEMA Sloj 1 fix, pa ga ne može dohvatiti kroz aplikaciju. Tri opcije, biraš jednu:

- **(A) Email s direktnim linkom** — pošalji joj `https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/public-assets/releases/vmbalance-2.0.2.apk`. Otvori link u Chrome/Samsung Browseru → preuzme APK → instalira preko postojeće verzije (isti potpis, podaci ostaju).
- **(B) WhatsApp/SMS isto** — još jednostavnije, isti link.
- **(C) Privremeno joj kroz `UpdateAvailableDialog` prikazati "Otvori u browseru" gumb koji koristi puki HTML `<a target="_blank">` umjesto `Browser.open()`** — ali to traži novi APK koji ona ipak prvo mora ručno instalirati, pa se vraća na (A)/(B).

Realno: jedina trenutna opcija za Vinku je manualni link (A ili B). Sloj 1 spriječit će da se ovo ponovi za buduće korisnike.

## Verifikacija

- Nakon Sloja 1 build: provjeri da `npx cap sync android` u `build-apk.bat` registrira Browser (čak i ako mu sad više nije ključan).
- Nakon update testa: u `app_diagnostics_logs` tražiti `event = 'update_install_intent_launched'` s `strategy: 'window_system'`.

## Pitanje za tebe

1. Slažeš li se s pristupom (Sloj 1 + ručni link Vinki)?
2. Da li da odmah ovo implementiram kao verziju **2.0.3** (jer 2.0.2 već ima istu broken Browser logiku) — ili ostavljamo verzijski broj i samo rebuilanš APK?
