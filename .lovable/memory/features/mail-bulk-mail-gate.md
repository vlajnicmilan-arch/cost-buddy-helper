---
name: Ograda masovne pošte u mail lijevku
description: Zaglavlja List-Unsubscribe/List-Id/Precedence/Auto-Submitted se spremaju pri prijemu; dva pravila odbijanja prije i poslije klasifikacije
type: feature
---

- Zaglavlja se spremaju u `inbound_messages`: `list_unsubscribe`, `list_id`, `precedence`, `auto_submitted` (migracija rujan 2026, RPC `mail_ingest_store_message` prošireni potpis). `mail-process` za STARU poštu čita iste oznake iz sirovog `raw.json`; zapisano polje ima prednost.
- Čiste funkcije: `supabase/functions/_shared/mailImport/bulkMailSignals.ts`. Testovi: `src/test/mailBulkSignals.test.ts`.
- PRAVILO 2 (`masovna_posta`): oznaka masovne pošte **I** nula privitaka → poruka se zatvara PRIJE klasifikacije; ne stvara se stavka, ne troši se AI kvota. Preskače se ako je korisnik već odlučio o stavci te poruke.
- PRAVILO 3 (`bez_iznosa_i_broja`, privremeno): stavka bez privitka, klasificirana kao `ponuda`/`racun`, bez iznosa **I** bez broja računa → `nije_za_nas`. Uvjet je I, nikad ILI. Korisnikova vlastita klasifikacija je jača.
- Instrumentacija: `app_diagnostics_logs`, event `mail_bulk_rejected`, `details` = message_id, rule, markers, from_header, has_attachment.
- POZNATI SUKOB: FININA „Obavijest o primitku dokumenta" nosi `List-Unsubscribe` i nema privitka → pravilo 2 je odbacuje. Ako se to pokaže štetnim, treba iznimka za FINA-u, ne ukidanje pravila.
