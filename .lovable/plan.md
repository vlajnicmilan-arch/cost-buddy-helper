Provjereni nalazi iz dijagnostike

- Telefon je otvorio Wallet i odabrao PDF u 07:25:28.
- Frontend je pokrenuo async PDF job `9823147d-398a-499b-855b-7448ed382ae8` u 07:25:31.
- Backend job je stvarno završio u bazi u 07:26:18, nakon 47 sekundi.
- Job ima status `completed` i rezultat s 42 transakcije.
- Nakon `pdf_parse_job_started` nema nijednog zapisa s telefona: nema `pdf_parse_job_completed`, nema `payment_source_pdf_parse_result`, nema `payment_source_pdf_preview_opened`, nema `pdf_parse_failed`.

Zaključak

- Problem više nije u backend parsiranju PDF-a: backend je odradio posao.
- Problem je u frontend polling/UI toku nakon pokretanja joba: telefon ne dođe do koda koji čita gotov rezultat i otvara preview/import dijalog.
- Trenutni UI i dalje prikazuje tekst “do 30 sekundi”, a stvarni job traje 47 sekundi; to samo po sebi ne ruši job, ali potvrđuje da frontend tok nije dobro dizajniran za dulje native/mobile obrade.

Plan popravka

1. Ukloniti oslanjanje na jedan dug `await parsePDF(...)` unutar `PaymentSourceTransactionsDialog`.
   - Umjesto toga, PDF import treba imati eksplicitno stanje joba: `starting`, `processing`, `completed`, `failed`.
   - UI dijalog izvora plaćanja ostaje otvoren, a obrada se nastavlja neovisno o file-picker/native lifecycleu.

2. Premjestiti PDF polling u stabilniji tok koji logira svaki ključni korak.
   - Logirati: početak pollinga, svaki veći status prijelaz, RLS/REST grešku, timeout, uspješno otvaranje previewa.
   - Trenutno nema dovoljno dijagnostike poslije `pdf_parse_job_started`, zato ne vidimo gdje točno pukne.

3. Dodati recovery za već završene jobove.
   - Ako je job završen u bazi, aplikacija mora moći ponovno dohvatiti zadnji `completed` job za korisnika i otvoriti rezultat, umjesto da rezultat “nestane” ako se komponenta/native WebView prekine tijekom čekanja.
   - Ovo direktno pokriva provjereni slučaj: job završen, ali UI nije otvorio rezultat.

4. Popraviti loading poruku i zadržati dijalog.
   - Ne zatvarati postojeći dijalog dok se job obrađuje.
   - Prikazati stvarni status: “Obrada traje, može potrajati oko minute” umjesto netočnih 30 sekundi.
   - Sav UI tekst ide kroz i18n, bez hardkodiranja.

5. Validirati nakon implementacije.
   - Provjeriti da `pdf_parse_jobs` ima završen job i da frontend može dohvatiti rezultat.
   - Provjeriti dijagnostiku: očekivani slijed mora biti `payment_source_pdf_file_selected` → `pdf_parse_job_started` → `pdf_parse_job_completed` → `payment_source_pdf_parse_result` → `payment_source_pdf_preview_opened`.

Neću dirati verziju APK-a u ovom planu.
