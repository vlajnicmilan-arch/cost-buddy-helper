-- Podizanje mjesečne kvote uvoza iz maila (odluka vlasnika, 2.9.2026.):
--   bez plaćenog modula: 5  -> 25
--   s plaćenim modulom:  100 -> 1000000 (praktički neograničeno)
-- NAMJERNO veliki broj, a NE NULL: usporedba `v_used + p_count > NULL`
-- daje NULL (ne istina), pa bi grana u mail_import_consume_quota tiho
-- propustila sve. Veliki broj se ponaša isto, a ne može tiho zakazati.
CREATE OR REPLACE FUNCTION public.mail_import_monthly_limit(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Kvota broji SAMO dokumente koje aplikacija nije uspjela pročitati bez
  -- AI-a (poziv unutar `if (wantsAi)` u mail-process), ne stigle mailove.
  -- Kolovoz 2026: vlasnik 129, drugi aktivni korisnik 22 takva dokumenta.
  -- 1000000 = praktički neograničeno (svjesno NE NULL — usporedba s NULL
  -- tiho ne okine). Brane od zlouporabe: 30/sat + 100/dan po adresi
  -- (uniq_mail_alias_active_per_user) i globalna kapica troška.
  SELECT CASE
    WHEN public.has_any_paid_plan(_user_id)            -- modul (plaćen, probni, poček), admin, legacy pretplata
      OR public.has_entitlement(_user_id, 'mail_uvoz') -- naslijeđeno posebno pravo
    THEN 1000000
    ELSE 25
  END;
$function$;