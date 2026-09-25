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
$function$
;
