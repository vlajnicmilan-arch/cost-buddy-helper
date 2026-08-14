---
name: Obavijest o dokumentu — jedna vijest, samogašenje
description: mail_document_pending dedup po item_id, DB okidač gasi kad stavka napusti na_pregledu, izuzeta iz "Za pažnju"
type: feature
---
- `mail-process` upisuje obavijest s `dedup_key = 'mail_document_pending:<item_id>'`; greška 23505 je dedup (ne kvar) i ne logira se.
- DB okidač `trg_mail_resolve_pending_notification` (funkcija `mail_resolve_pending_notification`) na `document_ingest_items` AFTER UPDATE OF status: čim stavka napusti `na_pregledu`, obavijest → `status='resolved'`, `read=true`, `resolved_at=now()`.
- Migracija 20260814145103 je retroaktivno zatvorila viseće obavijesti i dodala dedup oznake.
- `useActiveIssues` ima `.neq("type","mail_document_pending")` — jantarna kartica u /dokumenti JE poziv na radnju; zvono/push pri dolasku ostaje.
- Čuvar: `src/test/mailPendingNotificationLifecycle.test.ts` + `src/test/mailNotificationSchema.test.ts`.
