-- ═══════════════════════════════════════════════════════════════════
-- Fix worker privacy leak in participant_digest + add worker hours notif
--
-- PROBLEM: enqueue_participant_digest_event() sada šalje financijski
-- sažetak SVIM project_members bez obzira na ulogu → radnik s role='worker'
-- (koji u UI-u NEMA financijski uvid) dobivao je vlasnikove troškove.
--
-- KANONSKI CHECK: project_members.role = 'worker' NE VIDI financije u UI-u
-- (deriveProjectPermissions.canAddTransaction / canEditFinancial = false,
--  projectTabVisibility skriva Budget/Transactions/Team/Worklog).
-- Server MORA replicirati to pravilo za sve notifikacije koje sadrže
-- financijski/aktivnostni sadržaj projekta.
--
-- PRAVILO PARITETNOSTI (paritet server↔UI):
--   Obavijest ne smije sadržavati informaciju koju primateljeva uloga NE VIDI
--   u aplikaciji. Provjera mora živjeti u generatoru (server-side), ne
--   u klijentu. Ovaj RPC je zajednička točka za participant_digest —
--   jedna izmjena pokriva sve pozivatelje (notify-project-transaction,
--   notify-project-activity, notify-pending-transaction, notify-note-added,
--   check-milestone-budgets…).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enqueue_participant_digest_event(
  p_project_id uuid,
  p_actor_user_id uuid,
  p_event jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_now timestamptz := now();
  v_recipients uuid[];
begin
  if p_project_id is null or p_actor_user_id is null then
    raise exception 'invalid_args';
  end if;

  select user_id into v_owner from public.projects where id = p_project_id;
  if v_owner is null then
    return;
  end if;

  -- PARITY GUARD: role='worker' NE dobiva participant_digest (radnik u UI-u
  -- nema uvid u financije/aktivnost projekta). Owner + svi ostali role-evi
  -- (member/viewer/investor) nastavljaju primati kao dosad.
  with recipients as (
    select v_owner as uid
    union
    select pm.user_id
      from public.project_members pm
     where pm.project_id = p_project_id
       and coalesce(pm.role, '') <> 'worker'
  )
  select array_agg(distinct uid) into v_recipients
  from recipients
  where uid is not null and uid <> p_actor_user_id;

  if v_recipients is null then
    return;
  end if;

  insert into public.participant_digest_state (
    user_id, project_id, pending_count, pending_summary, last_event_at, updated_at
  )
  select uid, p_project_id, 1, jsonb_build_array(p_event), v_now, v_now
  from unnest(v_recipients) as uid
  on conflict (user_id, project_id) do update
    set pending_count = participant_digest_state.pending_count + 1,
        pending_summary = participant_digest_state.pending_summary || excluded.pending_summary,
        last_event_at = v_now,
        updated_at = v_now;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- Radnička obavijest: kad vlasnik/član upiše sate za radnika koji ima
-- user_id (tj. spojen na auth korisnika), obavijesti tog radnika.
-- Šalje se ISKLJUČIVO tom radniku, s minimalnim sadržajem (datum, sati,
-- projekt, actor). Ne sadrži nikakve financije.
-- Isplate (project_worker_payouts) već imaju vlastiti trigger.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_work_entry_notify_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_worker_user uuid;
  v_actor uuid := auth.uid();
  v_project_name text;
  v_actor_name text;
begin
  select w.user_id into v_worker_user
    from public.project_workers w
   where w.id = NEW.worker_id;

  -- Skip: radnik nije spojen na auth ili je sam upisao svoje sate.
  if v_worker_user is null then
    return NEW;
  end if;
  if v_actor is not null and v_actor = v_worker_user then
    return NEW;
  end if;

  select name into v_project_name
    from public.projects where id = NEW.project_id;

  select coalesce(display_name, full_name, 'Vlasnik')
    into v_actor_name
    from public.profiles where id = v_actor;

  begin
    insert into public.notifications (
      user_id, type, title, message, data, read, status
    ) values (
      v_worker_user,
      'work_entry_recorded',
      'notifications.work_entry_recorded.title',
      'notifications.work_entry_recorded.message',
      jsonb_build_object(
        'project_id', NEW.project_id,
        'entry_id',   NEW.id,
        'work_date',  NEW.work_date,
        'hours',      NEW.actual_hours,
        'title_vars', jsonb_build_object(
          'project', coalesce(v_project_name, '')
        ),
        'message_vars', jsonb_build_object(
          'hours', NEW.actual_hours,
          'date',  to_char(NEW.work_date, 'DD.MM.YYYY'),
          'actor', coalesce(v_actor_name, '')
        )
      ),
      false,
      'active'
    );
  exception when others then
    raise log 'trg_work_entry_notify_worker failed: % %', SQLERRM, SQLSTATE;
  end;

  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_work_entry_notify_worker_insert ON public.project_work_entries;
CREATE TRIGGER trg_work_entry_notify_worker_insert
  AFTER INSERT ON public.project_work_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_work_entry_notify_worker();