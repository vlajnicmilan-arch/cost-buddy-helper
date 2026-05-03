Razumijem frustraciju. Provjerio sam stvarno stanje datoteka prije nego što išta tvrdim, i potvrđujem da su oba problema realna i rješiva u istom buildu.

## Što sam konkretno provjerio

**Logo problem — DOKAZANO:**
- `src/assets/logo.png`, `public/logo-512.png`, `public/logo-192.png`, `public/favicon.png` — svi imaju **isti MD5 hash** (`2dcb0bfffd69b985ca408ae1091d9a44`). To je tvoj pravi V&M Balance logo, koristi se na webu i u PWA.
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` — **drugačiji MD5** (`9e029293...`)
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` — **drugačiji MD5** (`ed3696b7...`)
- `android/app/src/main/res/drawable-port-xxxhdpi/splash.png` — **drugačiji MD5** (`b5b1b22b...`)
- `android/app/src/main/res/drawable/splash.png` — **drugačiji MD5** (`acc976d4...`)

To su zadane Capacitor placeholder slike koje su se generirale kad je `android/` folder dodan. Niti jedna ranija verzija nije ih nikad zamijenila s tvojim logom. Zato se u APK-u "vraća stari logo" — on nikad nije bio ni promijenjen u nativeu, samo na webu.

**OAuth problem — DOKAZANO:**
- `src/hooks/useNativeOAuth.ts` šalje Google login na bridge `https://vmbalance.com/native-oauth/callback`
- `src/pages/NativeOAuthCallback.tsx` je upravo ekran "Vraćamo vas u aplikaciju" — i sad ne uspijeva otvoriti APK natrag
- intent-filter u `AndroidManifest.xml` je trenutno preusko vezan na `host="auth"` + `pathPrefix="/callback"`

## Plan popravka (jedan build, oba problema)

### A. Logo u Androidu — zamijeniti sve placeholder ikone

Generirati iz `src/assets/logo.png` sve potrebne Android resurse na pravilnim rezolucijama i prepisati postojeće placeholdere:

**Launcher ikone** (`android/app/src/main/res/`):
- `mipmap-mdpi/ic_launcher.png` 48×48
- `mipmap-hdpi/ic_launcher.png` 72×72
- `mipmap-xhdpi/ic_launcher.png` 96×96
- `mipmap-xxhdpi/ic_launcher.png` 144×144
- `mipmap-xxxhdpi/ic_launcher.png` 192×192
- isto za `ic_launcher_round.png` (kvadratni s alpha) i `ic_launcher_foreground.png` (108×108 dp safe zone, scale ~70%)

**Splash slike** (logo centriran na `#0f172a` pozadini, već postavljenoj u `capacitor.config.ts`):
- `drawable/splash.png`
- `drawable-port-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi/splash.png`
- `drawable-land-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi/splash.png`

Generiranje radim Pythonom u izvršnom modu (Pillow je dostupan), pa su slike točno usklađene s `src/assets/logo.png`. Nema ručnog dizajna, nema pogađanja.

### B. Native OAuth — maknuti web bridge iz glavnog flowa

1. `src/hooks/useNativeOAuth.ts` — promijeniti `redirectTo` s
   `https://vmbalance.com/native-oauth/callback` na
   `app.lovable.costbuddy://auth/callback`.

2. `android/app/src/main/AndroidManifest.xml` — zamijeniti uski filter (`host="auth"` + `pathPrefix="/callback"`) službenim Capacitor obrascem koji hvata sve unutar custom scheme:

   ```xml
   <intent-filter>
     <action android:name="android.intent.action.VIEW" />
     <category android:name="android.intent.category.DEFAULT" />
     <category android:name="android.intent.category.BROWSABLE" />
     <data android:scheme="@string/custom_url_scheme" />
   </intent-filter>
   ```

   `custom_url_scheme` je već `app.lovable.costbuddy` u `strings.xml`.

3. `src/pages/NativeOAuthCallback.tsx` — ostaje samo kao fallback za stare buildove; u glavnom Google flowu se više neće prikazivati.

4. Backend redirect lista mora dopustiti `app.lovable.costbuddy://auth/callback`. Ako alat to dopusti nakon odobrenja, postavit ću izravno; inače ću ti dati točan link.

### C. Bez novih hardcoded tekstova

Nema novog UI texta — sve postojeće `auth.nativeOAuth.*` ključeve ostavljam jer i dalje vrijede za rijetki fallback slučaj.

## Lokalni koraci nakon mojih promjena

```bat
git pull
npm install --legacy-peer-deps
npm run build
npx cap sync android
npx cap open android
```

U Android Studiju:
- **Build → Clean Project**
- **Build → Rebuild Project**
- **Build → Build Bundle(s) / APK(s) → Build APK(s)**

Na mobitelu: **deinstaliraj** staru aplikaciju pa instaliraj novi APK. Bez deinstalacije Android može zadržati staru ikonu u cacheu launchera.

## Očekivani rezultat

- Ikona aplikacije i splash u APK-u su tvoj V&M Balance logo, identičan webu.
- Google prijava u APK-u više ne prolazi kroz "Vraćamo vas u aplikaciju" — povratak ide direktno u APK.
