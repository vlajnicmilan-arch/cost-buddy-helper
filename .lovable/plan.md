## Stvarno provjereno

- `parse-pdf-statement` backend nije problem: zadnji logovi pokazuju:
  - `2026-05-19T04:33:21Z INFO Extracted 42 transactions from Aircash`
  - raniji pokušaji također vraćaju 42 transakcije
- Nema logova s `Error` u toj edge funkciji.
- Trenutni browser snapshot ne sadrži `parse-pdf-statement` network zapis, pa ne mogu potvrditi konkretan response iz tvog zadnjeg klika.
- UI kod trenutno otvara PDF preview kao nested shadcn/Radix `<Dialog>` unutar custom fullscreen modala `PaymentSourceTransactionsDialog`.

## Do I know what the issue is?

Da, dovoljno za popravak bez nagađanja: parser vraća transakcije, ali preview UI se ne prikazuje korisniku. Prethodni z-index popravak nije dovoljan jer je problem u samom obrascu renderiranja: nested Radix dialog portal unutar custom fullscreen modala je krhak u ovom flowu.

## Točan popravak

Umjesto nested Radix `<Dialog>` za PDF preview i duplicate warning u `PaymentSourceTransactionsDialog`, prebaciti ih u stabilan inline fullscreen overlay unutar istog `z-[60]` konteksta:

1. Ukloniti ovisnost PDF previewa o portalu/nested dialogu.
2. Renderirati PDF preview kao `AnimatePresence`/`motion.div` direktno u `PaymentSourceTransactionsDialog`:
   - `fixed inset-0 z-[80]`
   - vlastiti backdrop
   - vlastiti panel
   - isti sadržaj i isti gumb “Uvezi”
3. Isto primijeniti na duplicate warning overlay:
   - ostaje isti dedupe flow
   - samo se mijenja način prikaza
4. Zadržati postojeću import logiku:
   - `parsePDF`
   - `setPdfPreviewOpen(true)`
   - `handleImportPDFTransactions`
   - `handleConfirmImportWithDuplicates`
5. Dodati minimalne dev dijagnostičke logove u PDF select flow:
   - nakon parsiranja: broj transakcija
   - kad se otvara preview
   Ovo pomaže ako se problem ponovi, bez utjecaja na korisnički UI.

## Što se ne dira

- Backend parser se ne mijenja jer je dokazano vratio transakcije.
- Import u `expenses` se ne mijenja.
- Deduplikacija se ne mijenja.
- Globalni shadcn dialog se ne dira više.

## Verifikacija

- Provjeriti da `PaymentSourceTransactionsDialog` više nema PDF/duplicate nested Radix dialoge.
- Provjeriti da se PDF preview renderira iznad izvora plaćanja (`z-[80]`).
- Provjeriti dev-server logove nakon izmjene.