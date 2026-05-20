
create or replace function public.soft_delete_record(
  p_table text,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sql text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_table not in ('expenses','projects','project_invoices','project_estimates','project_milestones') then
    raise exception 'invalid_table: %', p_table;
  end if;

  v_sql := format(
    'update public.%I set deleted_at = now(), deleted_by = $1
       where id = $2 and deleted_at is null
         and (user_id = $1 or exists (
           select 1 from public.user_roles ur where ur.user_id = $1 and ur.role = ''admin''
         ))',
    p_table
  );
  execute v_sql using v_uid, p_id;
end;
$$;

grant execute on function public.soft_delete_record(text, uuid) to authenticated;
