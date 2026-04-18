
Da, točno tako. Kod je 100% spreman u repozitoriju, ali nativni dio (Android plugin + `RECORD_AUDIO` permission u `AndroidManifest.xml`) mora se "uplesti" u APK na tvom računalu jer se `android/` mapa ne nalazi u repozitoriju.

## Što ti trebaš napraviti (5 koraka, ~10 min)

### 1. Povuci najnoviji kod
U terminalu, u korijenu projekta:
```bash
git pull
```

### 2. Instaliraj novi plugin
```bash
npm install --legacy-peer-deps
```
Ovo će instalirati `@capacitor-community/speech-recognition` koji smo dodali u `package.json`.

### 3. Sinkroniziraj s Androidom (KLJUČNI KORAK)
```bash
npm run build
npx cap sync android
```
Ova naredba **automatski**:
- kopira plugin u `android/` mapu
- dodaje `<uses-permission android:name="android.permission.RECORD_AUDIO" />` u `AndroidManifest.xml`
- dodaje `<queries>` za `RECOGNIZE_SPEECH` intent

Ne moraš ručno editirati nijednu Android datoteku.

### 4. Otvori Android Studio i napravi APK
```bash
npx cap open android
```
U Android Studiju:
- **Build → Generate Signed App Bundle / APK**
- Odaberi **APK**
- Koristi svoj postojeći keystore (isti kao i prošli put)
- Build varijanta: **release**

### 5. Instaliraj APK na mobitel
- Pošalji APK na mobitel (Drive/Email/USB)
- Otvori datoteku na mobitelu → Instaliraj
- **Pri prvom kliku na mikrofon u Daily Standupu** iskočit će nativni Android prompt: *"Allow V&M Balance to record audio?"* → klikni **Allow**

## Kako provjeriti da je uspjelo
1. Otvori projekt → Daily Standup → klikni mikrofon
2. Trebao bi se pojaviti **sustavski Android dialog** za dozvolu (nije isti kao web)
3. Nakon dopuštenja, govori hrvatski → tekst se popunjava u textarea u real-time

## Ako nešto pukne
- **`npm install` greška**: probaj `npm install --force` umjesto `--legacy-peer-deps`
- **`cap sync` greška o nedostajućem android folderu**: pokreni `npx cap add android` pa opet `npx cap sync android`
- **Mikrofon i dalje ne traži dozvolu**: javi mi, provjerit ćemo `AndroidManifest.xml` (možeš ga otvoriti u Android Studiju pod `app/manifests/`)

## Što JA ne mogu napraviti
- Pokrenuti `npx cap sync` (nema Android SDK u sandboxu)
- Generirati potpisani APK (nema tvojeg keystorea)
- Instalirati APK na tvoj mobitel

## Što JA mogu napraviti ako zatreba
- Dodati waveform animaciju dok snima
- Poboljšati error poruke
- Dodati gumb "Otvori postavke aplikacije" ako korisnik trajno odbije dozvolu
