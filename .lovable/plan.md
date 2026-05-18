## Cilj

Nakon što app generira PDF (ili CSV/ICS/ZIP) na native (Android), korisnik dobije gumb **"Otvori"** odmah u UI-u — bez traženja po File Manageru. Na webu se ne mijenja ništa (preglednik već pokazuje download bar).

---

## Pristup

1. **Novi plugin:** `@capacitor-community/file-opener@8.0.0` (matcha Capacitor `^8.0.1` u projektu — verified).
2. **`SaveToDownloads` već vraća `uri`** (verified u `src/lib/nativeSaveToDownloads.ts`) — koristim taj URI direktno za otvaranje.
3. **Globalni "File saved" dialog** mountan u `RouteAwareGlobalOverlays` (već postoji pattern za `FeedbackFAB`). Sluša event `file-saved` koji emitira `exportFile`. Prikazuje:
   - Naziv datoteke
   - Gumb **Otvori** → `FileOpener.open({ filePath: uri, contentType: mime })`
   - Gumb **Podijeli** → `Share.share({ files: [uri] })` (reuse postojeće logike)
   - Gumb **Zatvori**
4. **Dialog se NE prikazuje** na webu i kad je `mode === 'share'` (jer share sheet već daje "Open with"). Samo na native + `mode === 'save'`.
5. **`StatusFeedback` 1200ms toast se uklanja iz save flow-a** kad se prikaže dialog (inače bi se preklapali). Memory pravilo o StatusFeedbacku ostaje važiti za sve druge slučajeve.

---

## Tehničke promjene

### A. Dependencies
- `npm install @capacitor-community/file-opener@8.0.0 --legacy-peer-deps`

### B. Novi fajl: `src/lib/nativeFileOpener.ts`
- Thin wrapper: `openSavedFile(uri: string, mime: string): Promise<boolean>`
- Na webu noop (return false), na native poziva `FileOpener.open`.
- Catch + `showError(t('fileExport.openFailed', ...))`.

### C. Edit: `src/lib/fileExport.ts`
- `exportFileNative` (save grana): nakon uspješnog `SaveToDownloads.saveBlob`, umjesto `showSuccess` zove `emitFileSaved({ uri, fileName, mime })`.
- Novi modul-level helper `emitFileSaved` koji dispatcha `CustomEvent('file-saved', { detail })` na `window`.
- Share grana ostaje netaknuta (Share sheet već radi posao).
- Web grana ostaje netaknuta.

### D. Novi fajl: `src/components/FileSavedDialog.tsx`
- shadcn `Dialog`, z-[60] (memory: Dialog Layering).
- `useEffect` registrira `window` listener na `file-saved`, drži `useState<{ uri, fileName, mime } | null>`.
- 3 gumba (Otvori / Podijeli / Zatvori) — min 44px touch (memory: Coding Conventions).
- Sav text preko `t()` — novi i18n ključ namespace `fileExport.savedDialog.*`.

### E. Edit: `src/App.tsx`
- Import `FileSavedDialog`.
- Mount unutar `RouteAwareGlobalOverlays` pored `<FeedbackFAB />` (samo na privatnim rutama — public auth ne treba).

### F. i18n (`src/i18n/locales/{hr,en,de}.json`)
- `fileExport.savedDialog.title` — "Datoteka spremljena" / "File saved" / "Datei gespeichert"
- `fileExport.savedDialog.description` — "{{fileName}} je u Downloads mapi."
- `fileExport.savedDialog.open` — "Otvori" / "Open" / "Öffnen"
- `fileExport.savedDialog.share` — "Podijeli" / "Share" / "Teilen"
- `fileExport.savedDialog.close` — "Zatvori" / "Close" / "Schließen"
- `fileExport.openFailed` — "Otvaranje nije uspjelo" / "Open failed" / "Öffnen fehlgeschlagen"

### G. Native version bump (memory pravilo: native promjena = obavezan bump)
- `public/version.json`: `2.0.7` → `2.0.8`, ažurirati `apkUrl` na `vmbalance-2.0.8.apk`.
- `android/app/build.gradle`: `versionCode 14` → `15`, `versionName "2.0.7"` → `"2.0.8"`.

### H. Update memory
- `mem://features/post-export-open-action` (novi feature memory)
- Dodati u `mem://index.md` pod Memories.

---

## Što NE radim

- Ne mijenjam `StatusFeedback` API (memory: 1200ms zabranjeno produljiti).
- Ne diram `ExportButton` dropdown UI (Download/Share grane ostaju iste).
- Ne diram nijedan call-site `exportPDFDoc` / `exportFile` (19+ mjesta). Sve radi automatski preko eventa.
- Ne mijenjam web ponašanje.
- Ne dodajem opciju "Otvori" u ExportButton dropdown (premalo prostora; korisnik prvo spremi, pa odluči).

---

## Verifikacija nakon implementacije

1. `npm test` — sve postojeće prolazi (workflow `.github/workflows/test.yml` će to gate-ati).
2. Build prolazi.
3. Manual smoke (kad korisnik git pull + `cap sync` + APK): generiraj P&L PDF → dialog se pojavi → Otvori → otvara se u sistemskom PDF viewer-u.

---

## Fajlovi koji se mijenjaju

**Novo (3):**
- `src/lib/nativeFileOpener.ts`
- `src/components/FileSavedDialog.tsx`
- `mem://features/post-export-open-action`

**Edit (7):**
- `package.json` (+ lockfile, kroz `npm install`)
- `src/lib/fileExport.ts`
- `src/App.tsx`
- `src/i18n/locales/hr.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/de.json`
- `public/version.json`
- `android/app/build.gradle`
- `mem://index.md`
