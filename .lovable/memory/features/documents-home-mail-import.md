---
name: Dom za dokumente (mail uvoz #5)
description: Ekran /dokumenti, jantarni token --document-pending, pametna AI dopuna, sve iza prava mail_uvoz
type: feature
---
- `/dokumenti` (`src/pages/Documents.tsx`): tabovi „Na pregled" (`MailReviewList`) i „Primljeno" (`DocumentsReceivedTab`: odbačeno 30 dana + Vrati, zadnjih 20 poruka + retry).
- SVE iza prava `mail_uvoz` (`useMailImportAccess`): kartica na home-u, ekran, osobni prikaz `IncomingInvoicesWidget`. Čuvar: `src/test/documentsEntitlementGate.test.tsx`.
- Identitet: `--document-pending` / `-foreground` / `-surface` (index.css, :root/.dark/premium-dark) → Tailwind `document-pending`. NIJE `--warning`.
- Odbacivanje = status `odbacio_korisnik` (nije brisanje); povrat kroz `src/lib/mailReviewStatus.ts` (UNDO toast + „Vrati").
- Settings drži samo adresu; popisi žive na `/dokumenti`. Obavijest `mail_document_pending` → `/dokumenti`.
- Pametna dopuna: `needsAiEnrichment` + `hasExtractableText` u `classify.ts`. AI poziv SAMO kad heuristika ostavi prazno `total_amount|invoice_number|supplier_name` i postoji tekst; determinizam pobjeđuje; warning `ai_dopuna`. UBL i potpuna heuristika = 0 poziva (`src/test/mailEnrichmentTokens.test.ts`).
- Obavijesti (kolovoz 2026): `notifications` NEMA `title_key`/`body_key`/`dedup_ref` — i18n ključ ide u `title`/`message`, ruta i vars u `data`. Čuvar: `src/test/mailNotificationSchema.test.ts`.
- Živi kanal: `useMailRealtime` (jedan kanal, montiran u `MailRealtimeHost` iz App.tsx) sluša INSERT u `document_ingest_items` (owner_user_id) → CustomEvent `vm:mail-pending-changed` → refetch u `useMailPendingCount`/`useMailReviewQueue` + CentarNote s prečicom na /dokumenti. Tablica dodana u `supabase_realtime`.
- Push: iz `mail-process` kroz postojeći `sendPushNotification` (kategorija `pending`, i18n ključevi, deep link /dokumenti). Samo za `inserted` + `na_pregledu`.
