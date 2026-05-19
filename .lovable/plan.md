## Problem

Uvoz PDF transakcija ne radi kada se pokrene iz dialoga izvora plaćanja (npr. AirCash). Edge function uredno parsira PDF (log: "Extracted 48 transactions from Aircash"), ali korisnik vidi samo kratku poruku i ništa dalje.

## Root cause

`PaymentSourceTransactionsDialog` je full-screen `motion.div` sa `z-[60]` (custom modal, ne Radix). Unutar njega je ugniježđen shadcn `<Dialog>` za PDF preview, čiji `DialogContent` i overlay koriste default Radix `z-50`.

Rezultat: preview dialog se mounta i otvara, ali ostaje **ispod** parent containera. Korisnik vidi samo toast "Učitavam PDF" / "Pronađeno X transakcija" pa ništa.

Identičan problem postoji i za:
- Duplicate warning dialog (`duplicateWarningOpen`)
- Sve ostale ugniježđene shadcn `<Dialog>` instance unutar istog komponenta

`BankConnection` na `/wallet` stranici radi jer nije unutar drugog modala.

Ovo je već dokumentirano u memoriji: **Mobile Dialog Layering — z-[60] main, z-[70] popovers**.

## Fix

Podići z-index ugniježđenih dialoga iznad `z-[60]` parent containera:

1. **`src/components/PaymentSourceTransactionsDialog.tsx`** — za sve interne `<DialogContent>` (PDF preview, duplicate warning, i ostali ugniježđeni dialozi koji se otvaraju iz ovog ekrana):
   - Dodati `className="... z-[70]"` na `DialogContent`
   - Provjeriti i `DialogOverlay` ako se eksplicitno koristi; ako ne, overlay iz `dialog.tsx` ostaje `z-50` što je OK jer parent ionako prekriva sve ispod

2. **Verifikacija ostalih ugniježđenih dialoga** u istoj komponenti:
   - `pdfPreviewOpen` (linija 1066)
   - `duplicateWarningOpen`
   - svi drugi `<Dialog>` unutar `motion.div z-[60]`

3. **Bez izmjena globalnog `dialog.tsx`** — drugi (ne-ugniježđeni) dialozi moraju ostati na z-50.

## Što NIJE u opsegu

- Edge function `parse-pdf-statement` — radi ispravno
- `BankConnection` flow — radi ispravno
- Tekstovi / i18n — bez promjena
- Logika parsiranja / dedupe — bez promjena

## Verifikacija

- Otvoriti izvor plaćanja (AirCash) → Uvezi PDF → odabrati isti PDF → preview se mora pojaviti iznad parent modala
- Confirm import → duplicate warning (ako postoji) mora se pojaviti iznad parent modala
- Provjeriti da drugi (samostalni) dialozi u app-u i dalje rade normalno
