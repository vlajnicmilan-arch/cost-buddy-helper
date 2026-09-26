-- bank_sync_review čuvari R1–R9. Svaki DO blok pada s 'FAIL Rx'.
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.bsr_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', u, false) $$;
CREATE OR REPLACE FUNCTION public.bsr_bal(s uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance FROM public.custom_payment_sources WHERE id = s $$;
CREATE OR REPLACE FUNCTION public.bsr_payload(p_type text, p_amount numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('amount', p_amount, 'date', '2026-09-20T10:00:00Z', 'type', p_type,
    'description', 'KONZUM 123 ZAGREB', 'currency', 'EUR',
    'payment_source', 'custom:c1000000-0000-0000-0000-0000000000c1',
    'wallet_id', 'c1000000-0000-0000-0000-0000000000c1',
    'bank_raw_line', '{"remittance":"KONZUM 123 ZAGREB"}') $$;

-- Ručni kandidati korisnika A (već u knjigama → saldo ih već sadrži).
INSERT INTO public.expenses(id, user_id, type, amount, payment_source, date, description) VALUES
  ('e1000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-00000000000a', 'expense', 25,
   'custom:c1000000-0000-0000-0000-0000000000c1', '2026-09-19T08:00:00Z', 'Konzum ručno'),
  ('e2000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-00000000000a', 'expense', 25,
   'custom:c1000000-0000-0000-0000-0000000000c1', '2026-09-21T08:00:00Z', 'Konzum ručno 2');

CREATE TEMP TABLE bsr_fix AS SELECT public.bsr_bal('c1000000-0000-0000-0000-0000000000c1') AS bal_a0;
GRANT SELECT ON bsr_fix TO PUBLIC;

-- Red: service_role upisuje (kao sync).
SET ROLE service_role;
INSERT INTO public.bank_sync_review_queue(id, user_id, bank_account_id, stable_id, payload, reason, candidate_ids) VALUES
  ('d1000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-0000000000a1',
   'tx-new', public.bsr_payload('expense', 25), 'ambiguous',
   '["e1000000-0000-0000-0000-0000000000e1","e2000000-0000-0000-0000-0000000000e2"]'),
  ('d2000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-0000000000a1',
   'tx-dismiss', public.bsr_payload('expense', 25), 'uncertain', '[]'),
  ('d3000000-0000-0000-0000-0000000000d3', 'a0000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-0000000000a1',
   'tx-merge', public.bsr_payload('expense', 25), 'ambiguous',
   '["e1000000-0000-0000-0000-0000000000e1","e2000000-0000-0000-0000-0000000000e2"]'),
  ('d4000000-0000-0000-0000-0000000000d4', 'a0000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-0000000000a1',
   'tx-transfer', public.bsr_payload('expense', 100), 'rule_match_and_transfer_candidate', '[]'),
  ('d5000000-0000-0000-0000-0000000000d5', 'b0000000-0000-0000-0000-00000000000b', 'ba000000-0000-0000-0000-0000000000b1',
   'tx-b', public.bsr_payload('expense', 10), 'candidate_already_used_in_run', '[]');
RESET ROLE;

-- R1 dok red čeka, saldo se ne mijenja
DO $$ BEGIN
  IF public.bsr_bal('c1000000-0000-0000-0000-0000000000c1') <> (SELECT bal_a0 FROM bsr_fix) THEN
    RAISE EXCEPTION 'FAIL R1 saldo se promijenio dok red čeka'; END IF;
  RAISE NOTICE 'PASS R1 red ne mijenja saldo';
END $$;

-- R2 RLS: A vidi samo svoje, anon ništa
SET ROLE authenticated;
SELECT public.bsr_as('a0000000-0000-0000-0000-00000000000a');
DO $$ DECLARE n int; nb int; BEGIN
  SELECT count(*) INTO n FROM public.bank_sync_review_queue;
  SELECT count(*) INTO nb FROM public.bank_sync_review_queue WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
  IF n <> 4 OR nb <> 0 THEN RAISE EXCEPTION 'FAIL R2 A vidi % (tuđih %)', n, nb; END IF;
  RAISE NOTICE 'PASS R2 vlasnik vidi samo svoje retke';
END $$;
-- R3 authenticated ne smije pisati izravno
DO $$ BEGIN
  BEGIN
    UPDATE public.bank_sync_review_queue SET status = 'dismissed';
    RAISE EXCEPTION 'FAIL R3 izravni UPDATE prošao';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.bank_sync_review_queue(user_id, bank_account_id, stable_id, payload, reason)
    VALUES ('a0000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-0000000000a1', 'x', '{}', 'ambiguous');
    RAISE EXCEPTION 'FAIL R3 izravni INSERT prošao';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS R3 upis samo kroz service_role / RPC';
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.bank_sync_review_queue;
    RAISE EXCEPTION 'FAIL R2 anon čita';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.bank_sync_review_decide('d1000000-0000-0000-0000-0000000000d1', 'new');
    RAISE EXCEPTION 'FAIL R9 anon zove RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS R9 anon nema pristup ni tablici ni RPC-u';
END $$;
RESET ROLE;

-- R4 jedinstvenost (user, račun, stable_id)
DO $$ BEGIN
  BEGIN
    INSERT INTO public.bank_sync_review_queue(user_id, bank_account_id, stable_id, payload, reason)
    VALUES ('a0000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-0000000000a1', 'tx-new', '{}', 'ambiguous');
    RAISE EXCEPTION 'FAIL R4 duplikat prošao';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  RAISE NOTICE 'PASS R4 isti bankovni redak ne može dvaput u red';
END $$;

SET ROLE authenticated;

-- R5 tuđi korisnik ne može odlučiti
SELECT public.bsr_as('b0000000-0000-0000-0000-00000000000b');
DO $$ BEGIN
  BEGIN
    PERFORM public.bank_sync_review_decide('d1000000-0000-0000-0000-0000000000d1', 'new');
    RAISE EXCEPTION 'FAIL R5 tuđa odluka prošla';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
  RAISE NOTICE 'PASS R5 tuđi redak ne postoji';
END $$;

SELECT public.bsr_as('a0000000-0000-0000-0000-00000000000a');

-- R6 novi redak + dvostruka odluka
DO $$ DECLARE r jsonb; r2 jsonb; n int; BEGIN
  r := public.bank_sync_review_decide('d1000000-0000-0000-0000-0000000000d1', 'new');
  IF r->>'status' <> 'decided' OR r->>'expense_id' IS NULL THEN RAISE EXCEPTION 'FAIL R6 %', r; END IF;
  r2 := public.bank_sync_review_decide('d1000000-0000-0000-0000-0000000000d1', 'dismiss');
  IF r2->>'status' <> 'already_decided' OR r2->>'decision' <> 'new' THEN RAISE EXCEPTION 'FAIL R6 druga %', r2; END IF;
  SELECT count(*) INTO n FROM public.expenses WHERE bank_transaction_id = 'tx-new';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL R6 redaka %', n; END IF;
  RAISE NOTICE 'PASS R6 novi redak jednom; druga odluka = already_decided';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF public.bsr_bal('c1000000-0000-0000-0000-0000000000c1') <> (SELECT bal_a0 FROM bsr_fix) - 25 THEN
    RAISE EXCEPTION 'FAIL R6 saldo % očekivano %', public.bsr_bal('c1000000-0000-0000-0000-0000000000c1'), (SELECT bal_a0 FROM bsr_fix) - 25; END IF;
  RAISE NOTICE 'PASS R6 saldo se mijenja tek odlukom (−25)';
END $$;
SET ROLE authenticated;
SELECT public.bsr_as('a0000000-0000-0000-0000-00000000000a');

-- R7 preskoči: nema retka, ponovna odluka ne uvozi
DO $$ DECLARE r jsonb; n int; st text; BEGIN
  r := public.bank_sync_review_decide('d2000000-0000-0000-0000-0000000000d2', 'dismiss');
  r := public.bank_sync_review_decide('d2000000-0000-0000-0000-0000000000d2', 'new');
  IF r->>'status' <> 'already_decided' THEN RAISE EXCEPTION 'FAIL R7 %', r; END IF;
  SELECT count(*) INTO n FROM public.expenses WHERE bank_transaction_id = 'tx-dismiss';
  SELECT status INTO st FROM public.bank_sync_review_queue WHERE id = 'd2000000-0000-0000-0000-0000000000d2';
  IF n <> 0 OR st <> 'dismissed' THEN RAISE EXCEPTION 'FAIL R7 n=% st=%', n, st; END IF;
  RAISE NOTICE 'PASS R7 dismissed se ne uvozi';
END $$;

-- R8 spoji: samo s kandidatom, bez novog retka
DO $$ DECLARE r jsonb; n int; bt text; BEGIN
  BEGIN
    PERFORM public.bank_sync_review_decide('d3000000-0000-0000-0000-0000000000d3', 'merge',
      'e9999999-0000-0000-0000-000000000000');
    RAISE EXCEPTION 'FAIL R8 ne-kandidat prošao';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'target_not_candidate' THEN RAISE EXCEPTION 'FAIL R8 kod %', SQLERRM; END IF;
  END;
  r := public.bank_sync_review_decide('d3000000-0000-0000-0000-0000000000d3', 'merge',
    'e2000000-0000-0000-0000-0000000000e2');
  SELECT bank_transaction_id INTO bt FROM public.expenses WHERE id = 'e2000000-0000-0000-0000-0000000000e2';
  SELECT count(*) INTO n FROM public.expenses WHERE bank_transaction_id = 'tx-merge';
  IF bt <> 'tx-merge' OR n <> 1 THEN RAISE EXCEPTION 'FAIL R8 bt=% n=%', bt, n; END IF;
  RAISE NOTICE 'PASS R8 spajanje upisuje bankovni ID na odabrani redak';
END $$;

-- R10 prijenos: samo vlastiti novčanik, strane kao buildTransferPair
DO $$ DECLARE r jsonb; ps text; inc uuid; BEGIN
  BEGIN
    PERFORM public.bank_sync_review_decide('d4000000-0000-0000-0000-0000000000d4', 'transfer', NULL,
      'c3000000-0000-0000-0000-0000000000c3');
    RAISE EXCEPTION 'FAIL R10 tuđi novčanik prošao';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  r := public.bank_sync_review_decide('d4000000-0000-0000-0000-0000000000d4', 'transfer', NULL,
    'c2000000-0000-0000-0000-0000000000c2');
  SELECT payment_source, income_source_id INTO ps, inc FROM public.expenses WHERE bank_transaction_id = 'tx-transfer' AND type = 'transfer';
  IF ps <> 'custom:c1000000-0000-0000-0000-0000000000c1' OR inc <> 'c2000000-0000-0000-0000-0000000000c2' THEN
    RAISE EXCEPTION 'FAIL R10 ps=% inc=%', ps, inc; END IF;
  RAISE NOTICE 'PASS R10 prijenos s izvoda na vlastiti novčanik';
END $$;
RESET ROLE;

DO $$ BEGIN
  -- nakon: −25 (novi) −100 (prijenos odlazi s A tekući); spajanje i preskoči ne mijenjaju
  IF public.bsr_bal('c1000000-0000-0000-0000-0000000000c1') <> (SELECT bal_a0 FROM bsr_fix) - 125 THEN
    RAISE EXCEPTION 'FAIL R11 saldo %', public.bsr_bal('c1000000-0000-0000-0000-0000000000c1'); END IF;
  IF public.bsr_bal('c2000000-0000-0000-0000-0000000000c2') <> 600 THEN
    RAISE EXCEPTION 'FAIL R11 štednja %', public.bsr_bal('c2000000-0000-0000-0000-0000000000c2'); END IF;
  RAISE NOTICE 'PASS R11 saldo: novi −25, prijenos −100/+100, spajanje i preskoči 0';
END $$;
