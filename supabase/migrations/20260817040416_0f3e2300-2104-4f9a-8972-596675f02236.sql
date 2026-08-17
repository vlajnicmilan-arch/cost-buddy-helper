-- OŽIVLJAVANJE ŽIVOG SLUČAJA: „Fwd: Račun Grad Osijek".
-- Stavka je pala u odbacio_korisnik jer je pitanje imalo samo destruktivan
-- izlaz. Vraća se u red i poruka ide na ponovnu obradu kroz popravljeni put.
UPDATE public.document_ingest_items
   SET status = 'na_pregledu', warnings = '{}', updated_at = now()
 WHERE id = '89fbf7a8-7e78-4c20-bde5-1cf2b482ff5c';

SELECT public.mail_ingest_retry_message('fa944f7c-570c-4421-9d93-539b05543b24');