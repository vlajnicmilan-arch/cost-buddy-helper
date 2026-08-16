update public.inbound_messages
   set status = 'primljena', last_error = null, updated_at = now()
 where id = '230f068f-81f9-4eb0-b690-9c7c42ff67b2';

insert into public.ingest_jobs (message_id, status, attempts, next_run_at)
select '230f068f-81f9-4eb0-b690-9c7c42ff67b2', 'ceka', 0, now()
 where not exists (
   select 1 from public.ingest_jobs where message_id = '230f068f-81f9-4eb0-b690-9c7c42ff67b2'
 );

update public.ingest_jobs
   set status = 'ceka', attempts = 0, next_run_at = now(),
       last_error = null, locked_at = null, updated_at = now()
 where message_id = '230f068f-81f9-4eb0-b690-9c7c42ff67b2';