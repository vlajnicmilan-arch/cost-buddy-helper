## Problem (root cause)

Na **native Android** buildu Capacitor `Filesystem.writeFile({ directory: Directory.Documents })` ne piše u javni "Documents" folder već u **app-private external storage** (`/storage/emulated/0/Android/data/app.lovable.costbuddy/files/Documents/`). Korisnik vidi `showSuccess('Spremljeno u Dokumenti')`, ali datoteka nije vidljiva ni kroz Files app, ni Galeriju, ni file picker — efektivno "izgubljena".

Ovo pogađa **sve** PDF/CSV/JSON/ICS izvoze koji idu kroz `src/lib/fileExport.ts` (Reports, Project Reports, Business Reports, Spending Calendar, Items Analysis, Work Records, ICS Calendar, Backup, Financial Assistant).

Web (browser) radi normalno preko `<a download>`.

## Rješenje (arhitekturno, bez patcheva)

Na nativnoj platformi **uvijek** koristiti Android share/save dijalog (Capacitor Share + Filesystem cache). Korisnik dobiva native picker gdje bira odredište (Downloads, Drive, email, Telegram, Files...) i odmah vidi gdje je datoteka spremljena. Ovo je standardni Android UX i jedini pouzdan način da datoteka završi na mjestu koje korisnik može pronaći (bez MediaStore integracije koju Capacitor Filesystem 8 ne nudi).

Web ponašanje ostaje nepromijenjeno (`<a download>` za 'save', `navigator.share` za 'share').

## Promjene

### `src/lib/fileExport.ts`
- **Ukloniti** `Directory.Documents` write granu iz `exportFileNative`.
- Na native: `exportFile(...)` (oba moda 'save' i 'share') → `shareFromCache` putem `Directory.Cache` + `@capacitor/share`.
- Razlika ostaje samo u **dialogTitle**: 'save' → "Spremi datoteku", 'share' → "Podijeli datoteku" (i18n ključevi).
- Ukloniti `fileExport.savedToDocuments` success poruku (Android share dialog je sam po sebi povratna informacija; ako korisnik otkaže, ne emitiramo grešku).
- Zadržati postojeće obrade `AbortError`/`cancel`.

### i18n (HR/EN/DE) — `src/i18n/locales/*.json`
- Dodati / preimenovati ključeve:
  - `fileExport.saveDialogTitle` → "Spremi datoteku" / "Save file" / "Datei speichern"
  - `fileExport.shareDialogTitle` → već postoji
- Stari ključ `fileExport.savedToDocuments` može ostati (ne briše ga drugi kod), ali se više neće koristiti.

### `mem://architecture/native-file-export-system`
- Update napomene: na native uvijek share dialog, ne pisati u `Directory.Documents`.

## Što se NEĆE dirati
- Web download flow.
- Pozivi `exportFile/exportPDFDoc/exportTextFile` u 17+ datoteka (potpis ostaje isti — `mode` i dalje postoji).
- Generiranje PDF/CSV/JSON sadržaja.
- Permissions / AndroidManifest (share + cache ne traže dodatne dozvole).

## Verifikacija
- Web: kliknuti PDF export iz Reports → datoteka se preuzme u Downloads (kao i prije).
- Native APK: kliknuti PDF export → otvori se Android share dialog → korisnik bira "Spremi u Drive" / "Spremi u Files (Downloads)" / pošalji email → datoteka odmah dostupna na izabranoj lokaciji.
- Proizvoljan otkaz dialoga ne smije generirati error toast.