Provjerio sam kod i bazu. Ovo više nije nagađanje.

## Što je stvarno potvrđeno

- PDF parser radi: zadnji posao `40185654...` je u bazi `completed` i ima 37 transakcija.
- Frontend je pokrenuo obradu u 16:53:02 i polling u 16:53:04.
- Nakon toga nema client-side eventa `pdf_parse_job_completed`, `payment_source_pdf_preview_opened` ni `payment_source_pdf_import_clicked`.
- U kodu postoji konkretna greška: recovery logika za spremljeni PDF posao briše posao ako je već `completed`, umjesto da uzme `result` i otvori preview. To znači: ako se app reload-a, WebView se obnovi ili komponenta izgubi stanje dok AI obrada traje, završeni posao se izgubi iz UI-ja.

Problem nije u AI parseru. Problem je u lifecycle/recovery dijelu između završenog `pdf_parse_jobs.result` i prikaza/importa u UI.

## Plan popravka

1. **Popraviti recovery za završene PDF poslove**
   - U `PaymentSourceTransactionsDialog.tsx` recovery više ne smije brisati `completed` job.
   - Ako spremljeni job ima `status = completed` i `result`, treba ga pretvoriti u isti format kao normalni parser rezultat i pozvati postojeći preview flow.
   - Tek nakon uspješnog otvaranja previewa smije se očistiti localStorage ključ.

2. **Ukloniti ovisnost o komponentnom stateu za završeni rezultat**
   - Spremiti minimalni PDF import state po izvoru plaćanja: `jobId`, `sourceId`, `startedAt`, `phase`.
   - Recovery mora raditi i nakon povratka iz file pickera, reload-a, route remounta ili native lifecycle promjene.
   - Ne uvoditi globalni “latest job” fallback jer je već dokazano opasan za krivi izvor plaćanja.

3. **Osigurati da parsing hook izlaže sigurnu funkciju za pretvorbu rezultata**
   - `usePDFParser` trenutno ima interni `toParseResult`, ali dialog ga ne može koristiti za recovery completed joba.
   - Izložiti funkciju ili helper za normalizaciju `pdf_parse_jobs.result` → `PDFParseResult` bez dupliciranja logike.

4. **Dodati durable dijagnostiku za lifecycle prekid**
   - Dodati evente za: recovery completed job, recovery opened preview, recovery cleared job, polling abandoned/unmounted.
   - Kritične PDF evente zapisati tako da se ne izgube ako app/reload ubije 2s buffer.

5. **Popraviti import feedback i osvježavanje liste**
   - Nakon PDF importa pozvati `refetch` ili postojeći refresh callback tako da se lista izvora plaćanja sigurno osvježi iz baze.
   - `importFromCSV` trenutno ažurira lokalni state, ali u ovom toku želim dodatno zatvoriti rupu između stvarnog DB inserta i prikaza u dijalogu.

6. **Verifikacija nakon implementacije**
   - Provjeriti da novi tok daje slijed:
     - picker open
     - file selected
     - job started
     - job completed u bazi
     - preview opened iz normalnog toka ili recovery toka
     - import clicked
     - import success
     - novi `import_batch_id` u `expenses`
   - Posebno provjeriti slučaj: pokreni PDF obradu → izađi iz novčanika / vrati se → završeni job otvara preview, ne spinner.

## Tehnički zahvat

- Datoteke:
  - `src/hooks/usePDFParser.ts`
  - `src/components/PaymentSourceTransactionsDialog.tsx`
  - po potrebi `src/pages/Wallet.tsx` samo za refresh nakon importa
- Bez database migracije.
- Bez promjena u parser edge funkciji jer parser već vraća ispravan rezultat.