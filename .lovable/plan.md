## Provjerene činjenice

- Backend funkcija `parse-pdf-statement` radi: zadnji log pokazuje `Extracted 42 transactions from Aircash` i nema `Error` logova.
- Snapshot browsera/replay koji je trenutno dostupan nije iz tvog AirCash pokušaja nego s `/auth`/landing stanja, pa ga ne koristim kao dokaz.
- U `PaymentSourceTransactionsDialog.tsx` PDF tok radi ovako: `parsePDF()` vrati rezultat, hook interno pozove `setParsedData(result)`, parent zatim pozove `setPdfPreviewOpen(true)`.
- Preview overlay se renderira samo ako su istovremeno true: `pdfPreviewOpen && parsedData`.
- To je krhko jer se prikaz oslanja na state iz hooka koji se ažurira asinkrono, dok parent otvara overlay iz drugog statea.
- U komponenti još postoje hardkodani tekstovi u PDF overlayu, što je protiv i18n pravila.

## Problem koji treba popraviti

PDF parser vraća transakcije, ali UI ne pokazuje preview nakon učitavanja. Treba ukloniti ovisnost previewa o tom asinkronom hook-state paru i vezati prikaz na rezultat koji je stvarno vraćen iz `parsePDF()`.

## Plan implementacije

1. U `PaymentSourceTransactionsDialog.tsx` dodati lokalni state za rezultat koji se koristi isključivo za ovaj dijalog, npr. `sourceParsedData`.
2. U `handlePDFSelect` i `handleHTMLSelect`, nakon uspješnog `parsePDF/parseHTML`, spremiti vraćeni `result` direktno u lokalni state i tek onda otvoriti preview overlay.
3. Sve reference u preview/import toku prebaciti s `parsedData` na lokalni `sourceParsedData`.
4. Pri zatvaranju previewa, završetku importa i duplicate toku očistiti i lokalni state i hook state (`clearParsedData`) da nema starog rezultata.
5. Ukloniti privremene `console.info` debug logove iz prethodnog pokušaja.
6. Zamijeniti hardkodane vidljive tekstove u PDF overlayu postojećim ili novim i18n ključevima u HR/EN/DE.

## Verifikacija nakon izmjene

- Provjeriti da u kodu više nema uvjeta `pdfPreviewOpen && parsedData` za ovaj dijalog.
- Provjeriti da nema TypeScript/Vite grešaka u dev-server logu.
- Provjeriti da nema `console.info('[PDF Import]...')` debug ostataka.
- Backend ne dirati jer je logovima potvrđeno da parser radi.