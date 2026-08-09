---
name: Transportni dedup — reprocess nije prvi dolazak
description: resolveTransportDedup; reprocess preskače dedup, odbačena kopija nikad nije sidro
type: feature
---
- `supabase/functions/_shared/mailImport/transportDedup.ts` (`resolveTransportDedup`) jedini je put do transportnog dedupa; worker `mail-process` ne smije raditi sirovi `.eq("dedup_identity"...)` upit (čuvar u `src/test/mailTransportDedupReprocess.test.ts`).
- Pravilo 1: postoji li već stavka za (message_id, attachment_id) → `refresh`, dedup se preskače u cijelosti i ide normalna obrada + upsert osvježenje.
- Pravilo 2: sidro dedup pogotka ne smije biti stavka s `classification='duplikat_privitka'` ili `duplicate_of_item_id IS NOT NULL`. Odbačena kopija ne sudi originalu.
- `status='odbaceno'` je sustavska odluka (nije u `USER_DECIDED_STATUSES`), pa je "Ponovno obradi" smije vratiti u `na_pregledu`.
