Da, vidi se. Problem je bio vremenska zona: ja sam gledao UTC i krivo komunicirao.

Provjereno sada:

- Hrvatsko vrijeme 18:xx = UTC 16:xx.
- PDF jobovi poslije 18:00 postoje:
  - 18:29:19 — completed, 82 transakcije
  - 18:32:36 — completed, 57 transakcija
  - 18:35:25 — completed, 55 transakcija
  - 18:37:03 — completed, 55 transakcija
- Import batch-evi poslije 18:00 postoje:
  - 18:32:03 — 65 redaka uvezeno
  - 18:34:40 — 43 retka uvezeno
- Za jobove 18:35 i 18:37 vidim da su PDF-ovi obrađeni, ali ne vidim kasniji import batch u `expenses`.
- Za job 18:37 postoji log `payment_source_pdf_preview_opened` u 18:38:54.
- Za kasnije korake trenutno nemamo dovoljno precizan log: ne postoji pouzdan zapis “korisnik kliknuo Uvezi”, “import krenuo”, “duplicate dialog otvoren”, “import završen”, “import resetirao state”.

Što to znači:

- PDF parser radi: jobovi završavaju.
- Dio importa radi: postoje stvarni batch-evi u `expenses`.
- Problem je između završene PDF obrade, preview/duplicate flowa i finalnog importa u `expenses`.
- Trenutna dijagnostika nije dovoljna da dokaže točno gdje nestaje zadnji korak.

Plan:

1. Popraviti postojeći potvrđeni bug
- Spriječiti višestruki polling/recovery istog PDF joba.
- Ukloniti `fetchLatestPDFParseJob` recovery iz Payment Source dialoga jer može zakačiti krivi/stari processing job.
- Recovery smije koristiti samo `vmb-pdf-parse-job:<sourceId>` i samo za konkretni job.

2. Dodati precizne dijagnostičke evente za nedostajući dio toka
- PDF gumb kliknut.
- File picker otvoren.
- `input.onChange` pozvan, uključujući slučaj bez filea.
- File odabran.
- Job startan.
- Polling startan/skipped jer već postoji aktivni job.
- Preview otvoren.
- Uvezi kliknut.
- Duplicate dialog otvoren.
- Import pozvan s brojem transakcija.
- Import uspio / import greška / nema novih transakcija.
- Svaki reset PDF statea.

3. Stabilizirati završetak joba
- Kad job završi: očistiti storage key, postaviti `sourceParsedData`, otvoriti preview, pa tek onda maknuti processing state.
- Processing overlay ne smije ostati iznad previewa.

4. Provjera nakon implementacije
- Nakon novog pokušaja gledamo po Zagreb vremenu.
- Mora se vidjeti cijeli lanac: klik → file → job → preview → uvoz/duplikati → batch ili jasna poruka.
- Ako se prekine, točno ćemo znati na kojem eventu.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>