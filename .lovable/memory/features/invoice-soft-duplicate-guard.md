---
name: Meka brana duplikata računa
description: Normalizacija broja (afiks ≤2), širi uvjet OIB+iznos+datum, vidljivo upozorenje uz svjesnu potvrdu
type: feature
---
- JEDNA usporedba: `supabase/functions/_shared/mailImport/softDuplicate.ts` (`normalizeInvoiceNumber`, `invoiceNumbersMatch`, `findDuplicateCandidate`). Preglednik je vidi kroz `src/lib/mail/invoiceNumberMatch.ts`. Implementacija NE smije živjeti u zasebnoj novoj datoteci koju edge bundler ne vidi (deploy je padao s "Module not found").
- Normalizacija služi SAMO usporedbi: uppercase, samo A–Z0–9, afiks-tolerancija ≤2 znaka (I08-0626-390029 ≈ 08-0626-390029). Broj koji se sprema se nikad ne mijenja.
- Uvjet najave (direction-scoped, scope-omeđen): isti OIB + normalizirano isti broj (uz isti doc_type, default 380), ILI isti OIB + isti iznos + isto dospijeće/datum izdavanja.
- UI: `useMailDuplicateCandidates` + kartica u `MailReviewList` — jantarno upozorenje `mailReview.duplicate.warning` + kvačica „Svejedno unesi"; gumb Potvrdi je zaključan dok se ne potvrdi svjesno. NIKAD tvrdo blokiranje.
- Čuvar: `src/test/mailInvoiceDuplicateGuard.test.ts` (živi FINA par 64,70 €).
