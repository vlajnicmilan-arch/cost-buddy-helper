---
name: Pamćenje izdavatelja i mjesta (mail uvoz)
description: mail_issuer_memory, šifra obračunskog mjesta, place_label na računu, forwarder brana, Solin≠Split
type: feature
---
- Tablica `mail_issuer_memory` (user_id, business_profile_id, from_domain, supplier_oib, place_code, supplier_name, place_label, confirmed_count, last_seen_at). Uči SAMO `mail_item_confirm` (stavka stigla mailom); ručni XML upload se NE uči.
- `incoming_invoices.place_label` + RPC `incoming_invoice_set_place(invoice_id, label)` (upisuje na račun I u pamćenje).
- Šifra mjesta: `supabase/functions/_shared/mailImport/paymentReference.ts` — SAMO primarno pravilo (ključem-sidrene šifre: šifra kupca, broj kupca, obračunsko/mjerno mjesto, korisnički broj). REZ: sekundarno pravilo (stabilni prefiks PNB) se NE gradi.
- `_shared/mailImport/issuerMemory.ts::memoryFill` — poziva se između jeftine klasifikacije i AI odluke (pogodak gasi AI poziv). Nikad ne gazi neprazna polja; pouzdanost se ne diže; stavka ostaje `na_pregledu`.
- DVIJE RAZINE: točan ključ (domena/OIB + ista `place_code`) → OIB/naziv + `place_label`; fallback (`place_code=''`) → SAMO OIB/naziv. Oznaka mjesta na fallbacku NIKAD (brana Solin ≠ Split). UBL grana → samo `place_label`.
- Forwarder brana (`issuerKeyDomain`): javne domene + korisnikove `business_profiles.email` domene ne postaju ključ → pada se na OIB.
- Upozorenje `dopunjeno_iz_zapamcenog` (hr/en/de). Čuvar: `src/test/mailIssuerMemory.test.ts`.
- UI: `MailReviewList` polje `place_label`; `IncomingInvoicesPanel` chip u retku + Select filtar tek kad postoje ≥2 oznake (u zasebnom retku da ne slomi `eracunPanelNoHorizontalOverflow`).
