
## Plan: Native govor-u-tekst preko Capacitor plugina

### Što ćemo napraviti
Zamijeniti trenutni Web Speech API (koji ne radi pouzdano u Android WebView-u) s nativnim **`@capacitor-community/speech-recognition`** pluginom. On koristi Android sustavski govor-u-tekst i automatski traži dozvole na nativnoj razini.

### Kako će raditi
1. Klik na "Snimaj" → plugin provjeri dozvolu → ako nema, **iskače nativni Android prompt** ("Allow V&M Balance to record audio?")
2. Korisnik dopusti → snimanje kreće preko Android Speech Recognizera (hr-HR)
3. Tekst se popunjava u Textarea u real-time (partialResults)
4. U PWA / pregledniku → automatski fallback na postojeći Web Speech API

### Tehničke izmjene

**1. Dodati npm paket**
- `@capacitor-community/speech-recognition` (~v6/v7, kompatibilan s Capacitor 8)

**2. Refaktorirati `src/components/projects/DailyStandupSheet.tsx`**
- Detektirati platformu pomoću `Capacitor.isNativePlatform()`
- Native grana: `SpeechRecognition.requestPermissions()` → `SpeechRecognition.start({ language: 'hr-HR', partialResults: true, popup: false })`
- Listener: `SpeechRecognition.addListener('partialResults', ...)` puni textarea
- Web grana: zadržati postojeći `webkitSpeechRecognition` kod
- Pozivati `SpeechRecognition.stop()` i ukloniti listenere u `stopRecording` + na zatvaranju sheeta

**3. Bolje poruke za korisnika**
- Ako korisnik odbije dozvolu → toast: "Dopusti mikrofon u Postavke → Aplikacije → V&M Balance → Dopuštenja"
- Help dijalog (`showPermissionHelp`) ažurirati za nativne upute

### Što TI moraš napraviti na računalu nakon ovog (jednom!)

Ovo Lovable ne može — moraš ručno:

```bash
git pull
npm install --legacy-peer-deps
npx cap sync android
npx cap open android
```

Plugin **automatski dodaje** `RECORD_AUDIO` permission u `AndroidManifest.xml` kroz `cap sync`, pa nećeš ručno ništa editirati. Onda u Android Studiju → **Build → Generate Signed App Bundle/APK** → instaliraj novi APK na mobitel.

### Rizik / fallback
- Ako plugin ne podržava hr-HR na starijem Androidu (rijetko), pluš se vrati na engleski automatski
- Ako instalacija plugina ne uspije zbog peer-dep konflikta s Capacitor 8, koristit ćemo `--legacy-peer-deps` (već koristiš)

### Datoteke koje će se mijenjati
- `package.json` (+1 paket)
- `src/components/projects/DailyStandupSheet.tsx` (refaktor `startRecording`/`stopRecording`)
- `src/i18n/locales/{hr,en,de}.json` (par novih poruka za dozvole)
