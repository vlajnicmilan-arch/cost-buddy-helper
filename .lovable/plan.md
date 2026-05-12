## Provjera trenutnog stanja

- `useVoiceDictation` hook koristi **samo Web Speech API** (`webkitSpeechRecognition`).
- Komentar u kodu tvrdi da plugin nije instaliran — **netočno**: `@capacitor-community/speech-recognition@6.0.0` JE u `package.json`.
- Problem: Capacitor core je `^8.0.1`, plugin je `6.0.0` → **major mismatch** (potvrđeno u memoriji `capacitor-version-alignment` da to izaziva tihi native crash).
- Latest dostupna verzija plugina: **7.0.1** (peer `@capacitor/core: ">=7.0.0"`, prihvaća i v8). Službene v8 verzije još nema, ali peer dopušta v8.
- Hook se koristi samo u `DailyStandupSheet.tsx` (jedna lokacija).
- APK trenutno: **2.0.3** (versionCode 10).

## Plan

### 1. Nadogradnja plugina
- `@capacitor-community/speech-recognition`: **6.0.0 → 7.0.1**
- Ažurirati memoriju `capacitor-version-alignment` da spomene speech-recognition i kompromis (peer >=7 dopušta v8 dok ne izađe službena v8).

### 2. Refactor `useVoiceDictation`
Prepravi hook da koristi **3-slojni resolver**:

```text
Runtime detection:
├─ Capacitor.isNativePlatform() === true
│    └─ @capacitor-community/speech-recognition (Android/iOS native)
└─ Web (PWA, browser)
     └─ Web Speech API (postojeća logika)
     └─ iOS Safari → supported=false (bez promjene)
```

Native flow:
1. `SpeechRecognition.available()` — provjeri dostupnost
2. `SpeechRecognition.checkPermissions()` → `requestPermissions()` ako treba
3. `SpeechRecognition.start({ language, partialResults: true, popup: false, maxResults: 1 })`
4. Listener `partialResults` → emit interim transcripts (kontinuirano kao Web Speech)
5. `stop()` → `SpeechRecognition.stop()` + remove listener
6. Greške mapirane u postojeće `VoiceErrorKind` kategorije (`permission-denied`, `service-unavailable`, `unsupported`)

Sačuvati postojeće API potpise (`start`, `stop`, `recording`, `supported`, `errorKind`, `elapsedSec`, `continuing`, dijagnostika). `VoiceInputButton` ostaje **bez izmjena**.

### 3. Capacitor konfiguracija
- `capacitor.config.ts` — dodati plugin config ako treba (po defaultu nije nužno)
- Android `AndroidManifest.xml` — provjeri da `RECORD_AUDIO` postoji (vjerojatno već je zbog kamere/audio)
- iOS — Info.plist key `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription` (za buduće iOS izdanje)

### 4. Bump APK verzije
- `android/app/build.gradle`: versionCode `10 → 11`, versionName `2.0.3 → 2.0.4`
- `public/version.json`: `2.0.3 → 2.0.4`, `minSupportedVersion: 2.0.3`, `apkUrl` → `vmbalance-2.0.4.apk`

### 5. i18n
Postojeći ključevi (`voice.*`) već pokrivaju permission/service/unsupported dialoge — bez izmjena.

### 6. Verifikacija (nakon implementacije)
- TypeScript build prolazi
- `Capacitor.isNativePlatform()` grananje testirano u browseru (mora pasti na Web Speech bez native poziva)
- Korisnik mora: rebuild APK 2.0.4, upload preko APK Manager (Admin → APK tab), instalirati na uređaj, testirati u Dnevnik rada

## Tehnički detalji

**Datoteke koje se mijenjaju:**
- `package.json` (verzija plugina)
- `src/hooks/useVoiceDictation.ts` (native + web grananje)
- `android/app/build.gradle` (verzija)
- `android/app/src/main/AndroidManifest.xml` (provjera RECORD_AUDIO)
- `ios/App/App/Info.plist` (ako postoji folder — usage descriptions)
- `public/version.json`
- `mem://constraints/capacitor-version-alignment` (dodati napomenu)

**Datoteke koje OSTAJU iste:**
- `src/components/VoiceInputButton.tsx` — koristi hook kroz nepromijenjeni interface
- `src/components/projects/DailyStandupSheet.tsx`
- i18n locale datoteke

**Rizici:**
- Plugin v7 nema službenu v8 oznaku — ako native bridge fallaje na Capacitor 8 runtime-u, vraćamo se na Web Speech automatski preko fallback grane (degradacija, ne crash).
- iOS native test nije moguć dok korisnik ne pokrene Xcode build (Android je primarni target).

**Što NE radimo:**
- Ne mijenjamo `VoiceInputButton` UI
- Ne dodajemo gumb na nove ekrane (to ide kao zaseban task nakon što potvrdimo da nativno radi)
- Ne diramo ElevenLabs (ta opcija ostaje za budući iOS Safari fallback ako bude trebao)
