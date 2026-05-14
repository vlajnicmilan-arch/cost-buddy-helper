## Cilj
Na native Androidu klik "Preuzmi PDF" (i ostali izvozi: CSV/JSON/ICS) prikazuje native action sheet s dvije opcije:
- **Spremi na uređaj** → datoteka ide direktno u javni `Downloads/` folder (vidljivo u Files appu, Galeriji, bilo gdje); kratka poruka "Spremljeno u Downloads".
- **Podijeli…** → postojeći Android share sheet (Drive, mail, WhatsApp…).
- **Odustani**

Web ponašanje (browser download preko `<a download>`) ostaje nepromijenjeno.

## Tehnika

### 1. Native plugin `SaveToDownloads` (Kotlin, custom)
`android/app/src/main/java/app/lovable/costbuddy/SaveToDownloads.kt` — Capacitor plugin koji prima `{ base64, fileName, mime }` i:
- **Android 10+ (API 29+)**: koristi `MediaStore.Downloads.EXTERNAL_CONTENT_URI` + `ContentResolver.insert` + `OutputStream.write`. Bez ikakvih runtime permissiona (scoped storage). Datoteka završi u `/storage/emulated/0/Download/<fileName>`.
- **Android 9 i niže**: `Environment.DIRECTORY_DOWNLOADS` + `WRITE_EXTERNAL_STORAGE` permission (deklariran u manifestu samo za `maxSdkVersion=28`).
- Vraća `{ uri, displayName }`.

Plugin se registrira u `MainActivity.kt` preko `registerPlugin(SaveToDownloads::class.java)`.

### 2. Action sheet picker
Instalirati službeni `@capacitor/action-sheet` (verzija 8.x — usklađeno s `@capacitor/core` 8) i koristiti ga unutar `fileExport.ts` na native za prikaz "Spremi / Podijeli / Odustani". Bez ikakvog React state ili dialog koda — sve native.

### 3. `src/lib/fileExport.ts` (refactor)
- Novi mode tip: `ExportMode = 'save' | 'share' | 'choose'` (default `'choose'`).
- Helperi `exportPDFDoc`/`exportTextFile`/`exportFile` defaultiraju na `'choose'` umjesto `'save'`.
- Na **webu**: `'choose'` i `'save'` → `<a download>`; `'share'` → `navigator.share` s fallbackom na download.
- Na **native**:
  - `'choose'` → `ActionSheet.showActions` s opcijama. Korisnikov klik usmjeri u `'save'` ili `'share'` granu. Otkaz je no-op.
  - `'save'` → poziv novog `SaveToDownloads.saveBlob`, na uspjeh `showSuccess(t('fileExport.savedToDownloads', { name }))`.
  - `'share'` → postojeći `shareFromCache` (Cache + `@capacitor/share`).
- Ukloniti zastario `Directory.Documents` write (već uklonjeno u prethodnom koraku).

### 4. JS wrapper `src/lib/nativeSaveToDownloads.ts`
Tipiziran `registerPlugin<...>('SaveToDownloads')` s metodom `saveBlob(base64, fileName, mime)`.

### 5. i18n (HR/EN/DE) — `src/i18n/locales/*.json`
`fileExport`:
- `saveAction`: "Spremi na uređaj" / "Save to device" / "Auf Gerät speichern"
- `shareAction`: "Podijeli…" / "Share…" / "Teilen…"
- `cancel`: "Odustani" / "Cancel" / "Abbrechen"
- `chooseTitle`: "Što želiš s datotekom?" / "What do you want to do with the file?" / "Was möchtest du mit der Datei tun?"
- `savedToDownloads`: "Spremljeno u Downloads" / "Saved to Downloads" / "In Downloads gespeichert"

### 6. Memory update
`mem://architecture/native-file-export-system` → ažurirati: native ima 'choose' default → action sheet → save (MediaStore Downloads) ili share.

## Što se NEĆE dirati
- 17+ poziva `exportFile/exportPDFDoc/exportTextFile` u komponentama (ostavljaju default ili `'save'` — oba završe u choose grani na native).
- Generiranje PDF/CSV sadržaja.
- Web download flow.
- Bilo kakva DB/RLS/edge funkcionalnost.

## Native build napomena
- Novi plugin = **promjena u `android/`** + **novi npm paket `@capacitor/action-sheet`** → potreban `cap sync` (CI to radi automatski) + **novi APK build** + in-app update notifikacija. Live Sync sam (bez novog APK-a) NEĆE biti dovoljan jer plugin ne postoji u trenutnom binary buildu.
- `@capacitor/action-sheet@^8` mora biti major-aligned s `@capacitor/core@^8` (postojeća core verzija). Potvrđeno u memory `capacitor-version-alignment`.

## Verifikacija
1. **Native APK** (nakon novog buildova): klik "Preuzmi PDF" iz Reports → action sheet s 3 stavke → "Spremi" → datoteka odmah u `Files/Downloads/<ime>.pdf`, vidljivo bez share dialoga, toast "Spremljeno u Downloads".
2. Klik "Podijeli…" → postojeći share sheet kao do sad.
3. Klik "Odustani" → ništa se ne događa, bez error toasta.
4. **Web preview**: klik "Preuzmi PDF" → datoteka se preuzme u Downloads (`<a download>`), bez ikakvog action sheeta.