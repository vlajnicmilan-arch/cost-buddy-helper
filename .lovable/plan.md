## Problem

Kad otvoriš novčanik i klikneš izvor plaćanja, dijalog odmah pokazuje "Obrađujem izvod..." i nakon "Uvezi" se cijela petlja ponavlja u nedogled.

## Uzrok (potvrđen čitanjem koda)

U `src/components/PaymentSourceTransactionsDialog.tsx` postoje **dva** recovery efekta koji se okidaju kad se dijalog otvori:

1. **Lines 360–383** — čita `localStorage` ključ po izvoru (`vmb-pdf-parse-job:<sourceId>`). Ispravno: oslanja se na ID koji je ovaj klijent sam pokrenuo. Nakon `resetPdfImportState()` ovaj ključ se briše.

2. **Lines 385–411** — poziva `fetchLatestPDFParseJob()` (u `src/hooks/usePDFParser.ts:168`) koji vraća **bilo koji** `processing` ili `completed` red iz `pdf_parse_jobs` u zadnjih 6 sati, **bez vezivanja na payment_source**. Ako je status `completed`, odmah pokreće `runPdfJob(...)` → polling → otvara preview s tim transakcijama.

Bug: nakon što korisnik klikne "Uvezi", `resetPdfImportState()` briše lokalni state i localStorage, ali red u `pdf_parse_jobs` ostaje `completed`. Sljedeće otvaranje dijaloga → drugi efekt opet pronađe taj isti red → preview se opet otvara → endless loop. Isto se događa i pri prvom otvaranju aplikacije ako je u DB-u zaostao stari completed posao (npr. od ranije sesije).

Dodatno: `fetchLatestPDFParseJob` nije scoped na payment_source, pa "latest completed" iz potpuno drugog izvora kraduje fokus.

## Rješenje (minimalno, bez patch-flagova)

### A. `src/components/PaymentSourceTransactionsDialog.tsx` (efekt 385–411)

Ukloniti granu koja recoverira `completed` jobove. Auto-recovery preko "latest" smije postojati **samo** za `processing` stanje — to je legitiman scenario (klijent je startao posao pa pao prije nego što je dobio rezultat). `completed` jobove pokriva isključivo prvi efekt koji čita localStorage (povezuje job s konkretnim izvorom koji ga je pokrenuo).

```ts
// zadrži samo:
if (latest.job.status === 'processing') {
  // upiši u localStorage i polling
}
// obriši cijelu granu za status === 'completed'
```

### B. Garancija da se isti completed job ne reaktivira

Da budemo sigurni da i `processing`-grana ne završi otvaranjem prozora ako u međuvremenu drugi tab/uređaj već potroši rezultat, dodati provjeru: po završetku `runPdfJob` u `handlePdfJobResult` zapisati `consumed:<jobId>` u `sessionStorage` i u recovery efektu preskočiti job ID koji već postoji u toj listi unutar iste sesije.

(Trajno označavanje u DB-u — kolona `consumed_at` na `pdf_parse_jobs` — namjerno ostavljamo za kasnije; nije nužno za otkloniti petlju, a tražilo bi migraciju.)

### C. Sanity: scoping `fetchLatestPDFParseJob`

Ostaje kakav je za sada (vraća samo `processing` nakon promjene u A). Ako kasnije bude problema s "tuđim" jobovima između izvora, dodajemo `payment_source_id` u tablicu kroz migraciju — ne sada.

## Što NEĆE biti dirano

- `src/hooks/usePDFParser.ts` API (`fetchLatestPDFParseJob`, `waitForPDFParseJob`) — samo poziv u dijalogu se mijenja
- DB shema (`pdf_parse_jobs`)
- i18n stringovi
- Ostali dijalozi (Wallet, BusinessWallet, FamilyGroupDetailView) — koriste isti komponent, fix se naslijedi automatski

## Verifikacija

1. Otvoriti novčanik → klik na izvor → ne smije se pojaviti "Obrađujem izvod" ako korisnik ništa nije uploadao u toj sesiji.
2. Uploadati PDF, sačekati preview, kliknuti "Uvezi" → dijalog se zatvori, drugo otvaranje ne reaktivira isti job.
3. Pokrenuti upload, force-reload prije nego što završi → recovery (`processing`) opet hvata posao i prikaže preview kad bude gotov.
