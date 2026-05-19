## Što je provjereno

- Backend `parse-pdf-statement` radi: zadnji log pokazuje `Extracted 42 transactions from Aircash` u 04:25:15.
- Nema runtime errora u trenutnom snapshotu.
- Nema network zapisa za zadnji pokušaj u snapshotu, pa ne mogu potvrditi browser response.
- Trenutni z-index fix postoji na `DialogContent`, ali `DialogOverlay` u `src/components/ui/dialog.tsx` i dalje ostaje default `z-50`.

## Najvjerojatniji uzrok

PDF rezultat se vrati, ali preview dialog je i dalje slojno neispravan jer je `PaymentSourceTransactionsDialog` fullscreen layer `z-[60]`, a Radix overlay ostaje `z-50`. To može blokirati ili sakriti interakciju/preview u nested dialog scenariju.

## Plan implementacije

1. U `src/components/ui/dialog.tsx` proširiti `DialogContent` da opcionalno prima `overlayClassName`.
   - Ne mijenjati globalni default.
   - Ako se ništa ne proslijedi, svi postojeći dialozi ostaju `z-50` kao dosad.

2. U `src/components/PaymentSourceTransactionsDialog.tsx` za nested dialoge postaviti:
   - `DialogContent className="z-[70] ..."`
   - `overlayClassName="z-[65]"`

3. Obuhvatiti oba nested dialoga:
   - PDF preview (`pdfPreviewOpen`)
   - duplicate warning (`duplicateWarningOpen`)

4. Dodati eksplicitno korisničko stanje za slučaj da parser vrati rezultat bez transakcija ili se request ne završi greškom:
   - zadržati postojeće `pdfNoTransactions` ponašanje
   - ne dirati backend parser jer log potvrđuje da za AirCash vraća transakcije

## Verifikacija

- Provjeriti da su samo nested dialogi u `PaymentSourceTransactionsDialog` dobili viši overlay/content z-index.
- Provjeriti da globalni `dialog.tsx` default nije promijenio ponašanje drugih dialoga.
- Nakon implementacije: AirCash izvor → PDF import → preview mora biti vidljiv iznad fullscreen izvora plaćanja.