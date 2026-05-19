Fakti koje sam sad provjerio:

- PDF backend radi: zadnji poslovi se završavaju kao `completed` i imaju 37–82 transakcije.
- Aplikacija je stvarno pokrenula verziju `2.0.9` na Androidu.
- Za job `221e1678...` recovery je čak zapisao `payment_source_pdf_preview_opened` u 17:24:29.
- Nakon toga nema `payment_source_pdf_import_clicked` i nema novih redaka u `expenses` nakon 17:00.

Zaključak: problem više nije parser. Problem je UI/lifecycle tok nakon rezultata: preview/import živi u `PaymentSourceTransactionsDialog`, a taj dijalog se gasi, remounta ili ostaje u krivom sloju nakon native/WebView prekida. Dosadašnje promjene su liječile polling i localStorage, ali nisu maknule stvarni uzrok: PDF import ne smije ovisiti o životu tog dijaloga.

Plan popravka:

1. Uvesti stabilan globalni PDF import host
   - Napraviti tok po uzoru na postojeći `ReceiptScanContext` + globalni host.
   - PDF posao, rezultat, preview i import stanje držati izvan `PaymentSourceTransactionsDialog`.
   - Host mountati jednom u globalnim overlayima, tako da preživi `/home`, `/wallet`, remount i Android lifecycle.

2. Dijalog izvora plaćanja svesti na trigger
   - `PaymentSourceTransactionsDialog` više neće držati `pdfJobPhase`, `pdfJobId`, `sourceParsedData`, `pdfPreviewOpen`.
   - Gumb PDF samo šalje: source id, source name, file i import callback u globalni PDF import tok.
   - Time se uklanja ovisnost o tome je li dijalog još otvoren kad obrada završi.

3. Preview prikazivati iz globalnog overlay sloja
   - Preview overlay ide u isti globalni sloj kao ostali app overlayi, s jednim odgovornim z-indexom.
   - Import gumb ostaje dostupan čak i ako se stranica promijeni ili se izvorni dijalog remounta.
   - Processing overlay i preview više neće biti dva odvojena stanja unutar istog nestabilnog dijaloga.

4. Recovery raditi iz globalnog toka, ne iz dijaloga
   - Per-source job zapis ostaje, ali ga globalni host čita pri bootu/resumeu.
   - Ako je job `completed`, host otvara preview direktno.
   - Ako je `processing`, host nastavlja poll.
   - Nema “latest job” fallbacka.

5. Import nakon previewa mora biti dokaziv
   - Nakon klika Import logirati:
     - import clicked
     - duplicate result
     - insert started
     - insert success/failure
     - import batch id
   - Nakon uspješnog importa pozvati refetch/update za Home i Wallet.
   - Potvrditi u bazi da se pojavio novi `import_batch_id` u `expenses`.

6. Ukloniti prethodne krpice koje su pogrešan smjer
   - Maknuti timeout/guard logiku gdje samo maskira problem.
   - Zadržati samo nužan abort za zaglavljeni network zahtjev ako ostane u hooku, ali glavni fix mora biti stabilan owner stanja.

7. Verifikacija prije tvrdnje da je riješeno
   - Provjeriti stvarni slijed u logovima:

```text
file_selected
job_started
job_completed
global_preview_opened
import_clicked
expenses_insert_success
new import_batch_id in expenses
```

- Bez `expenses_insert_success` i novog batcha ne smijem reći da je riješeno.

Datoteke koje treba dirati:

- `src/hooks/usePDFParser.ts` — ostaviti kao servis za start/fetch/normalize, bez UI ownershipa.
- novi context/host za PDF import — globalni lifecycle-safe owner.
- `src/components/PaymentSourceTransactionsDialog.tsx` — ukloniti PDF state i spojiti samo trigger.
- `src/components/home/SharedDialogs.tsx`, `src/pages/Wallet.tsx`, moguće globalni overlay mount u `src/App.tsx`.
- i18n datoteke samo ako treba novi tekst.
- `public/version.json` i `android/app/build.gradle` — obavezan version bump jer je native promjena.