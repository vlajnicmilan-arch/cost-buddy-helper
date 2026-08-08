DELETE FROM public.notifications WHERE type = 'krug_membership_notice';

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT m.id AS membership_id, m.krug_id, m.user_id, m.created_at, k.name AS krug_name, o.user_id AS owner_id
      FROM public.krug_membership m
      JOIN public.krug k ON k.id = m.krug_id
      JOIN public.krug_ownership o ON o.krug_id = m.krug_id
     WHERE k.lifecycle_state = 'active'
       AND k.deleted_at IS NULL
       AND m.user_id <> o.user_id
       AND m.added_by IS NOT NULL
       AND m.added_by <> m.user_id
       AND m.created_at < '2026-08-08'::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM public.krug_invitations i
          WHERE i.krug_id = m.krug_id AND i.invited_user_id = m.user_id
       )
  LOOP
    PERFORM public.krug_emit_notification(
      'krug_membership_notice',
      r.krug_id,
      r.owner_id,
      NULL,
      NULL,
      'membership_notice:' || r.membership_id::text,
      ARRAY[r.user_id],
      jsonb_build_object('krug', r.krug_name, 'date', to_char(r.created_at, 'DD.MM.YYYY'))
    );
  END LOOP;
END
$do$;