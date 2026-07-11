-- Krug Shared Payment Source — permission matrix widening.
--
-- Nova pravila (nova matrica, potvrđena s produktom):
--   INSERT dozvoljen ako je user (owner ILI punopravni član)  I izvor pripada njemu.
--   DELETE dozvoljen ako je user  owner  ILI  linked_by = auth.uid() (dok je full member).
--   Ordinary član (obicni) nikad, niti insert niti delete.
--
-- Root-cause pre-fixa: `krug_can_manage_shared_source` je hard-lockirao
-- INSERT/DELETE na `krug_is_owner`. Punopravni članovi nisu prolazili gate
-- iako spec kaže da smiju dijeliti svoj vlastiti izvor.
--
-- Ovo je RLS-only + helper-only migracija: NE dira `expenses` /
-- `custom_payment_sources` semantiku, tako da nema impact-a na balance suite.

-- 1) Helper sada koristi krug_is_full_member (owner OR punopravni).
CREATE OR REPLACE FUNCTION public.krug_can_manage_shared_source(
  _krug uuid, _user uuid, _source_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uuid_part text;
  _src_uuid uuid;
BEGIN
  -- Owner ILI punopravni član su jedini koji smiju attachati.
  IF NOT public.krug_is_full_member(_krug, _user) THEN
    RETURN false;
  END IF;

  IF _source_id LIKE 'custom:%' THEN
    _uuid_part := substr(_source_id, 8);
    BEGIN
      _src_uuid := _uuid_part::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    -- Uvijek: izvor MORA pripadati korisniku (nitko ne dijeli tuđi izvor).
    RETURN public.is_payment_source_owner(_src_uuid, _user);
  END IF;

  -- Built-in slug (npr. 'cash') — full member je dovoljan; nema owner-per-source pojma.
  RETURN true;
END;
$function$;

-- Anon nikad ne smije zvati helper (defense-in-depth; RLS je već authenticated-only).
REVOKE ALL ON FUNCTION public.krug_can_manage_shared_source(uuid, uuid, text) FROM anon;

-- 2) DELETE policy — najuža izmjena, ne kroz helper (helper je INSERT-gate).
--    Dopusti brisanje ako je pozivatelj owner kruga, ILI ako je taj link
--    sam postavio (i još je full member u tom krugu).
DROP POLICY IF EXISTS krug_sps_delete_owner_and_source_owner ON public.krug_shared_payment_source;

CREATE POLICY krug_sps_delete_owner_or_linker
ON public.krug_shared_payment_source
FOR DELETE
TO authenticated
USING (
  public.krug_is_owner(krug_id, auth.uid())
  OR (
    linked_by = auth.uid()
    AND public.krug_is_full_member(krug_id, auth.uid())
  )
);

-- 3) INSERT policy — no logical change (still uses helper), ali preimenujemo radi
--    jasnoće da nije "owner only":
DROP POLICY IF EXISTS krug_sps_insert_owner_and_source_owner ON public.krug_shared_payment_source;

CREATE POLICY krug_sps_insert_full_member_and_source_owner
ON public.krug_shared_payment_source
FOR INSERT
TO authenticated
WITH CHECK (
  linked_by = auth.uid()
  AND public.krug_can_manage_shared_source(krug_id, auth.uid(), payment_source_id)
);
