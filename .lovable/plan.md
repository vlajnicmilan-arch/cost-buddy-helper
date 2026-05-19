## Nalaz

Stvarni logovi od prije par minuta potvrđuju problem:

- PDF job `77f08771-...` pokrenut je u 16:29 i završen u 16:30 s 82 transakcije.
- Nakon izlaska i povratka u izvor plaćanja aplikacija je u 16:31 napravila `payment_source_pdf_recovery_started` za isti job iz `localStorage`.
- Zato se opet prikazuje overlay “Obrađujem PDF”, pa tek onda ponovno otvara preview.

Root cause nije više `fetchLatestPDFParseJob`, nego per-source recovery iz `localStorage`: spremljeni job ostaje aktivan kad korisnik napusti dijalog prije nego je rezultat prikazan/konzumiran.

## Plan implementacije

1. U `PaymentSourceTransactionsDialog.tsx` dodati recovery samo za stvarno nedovršene jobove:
   - kod čitanja `vmb-pdf-parse-job:<sourceId>` prvo dohvatiti job po ID-u preko `fetchPDFParseJob`
   - ako je status `completed` ili `failed`, odmah obrisati storage key i ne pokretati `runPdfJob`
   - ako je status `processing` ili `pending`, tek tada nastaviti polling

2. U `usePDFParser.ts` izložiti `fetchPDFParseJob` u komponenti već postoji u hook returnu, samo ga treba koristiti u destrukturiranju.

3. Zadržati “latest job” recovery samo za `processing`, ali uskladiti s istim pravilom:
   - ne zapisivati u storage i ne vrtjeti completed jobove
   - dugoročno nema automatskog re-show previewa nakon što korisnik napusti izvor plaćanja

4. Dodati dijagnostiku za slučajeve:
   - stored job skipped jer je `completed`
   - stored job skipped jer je `failed`
   - stored job stvarno oporavljen jer je `processing/pending`

5. Verifikacija nakon promjene:
   - otvoriti izvor plaćanja nakon završenog joba: ne smije se pojaviti “Obrađujem PDF”
   - upload PDF-a: dok job traje overlay se smije prikazati
   - ako korisnik izađe dok job stvarno još traje i vrati se: recovery smije nastaviti polling