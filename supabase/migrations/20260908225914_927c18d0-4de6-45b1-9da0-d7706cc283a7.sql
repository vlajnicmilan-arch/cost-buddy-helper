CREATE TEMP TABLE _jrd_keep ON COMMIT DROP AS
SELECT * FROM cron.job_run_details WHERE start_time > now() - interval '7 days';

TRUNCATE cron.job_run_details;

INSERT INTO cron.job_run_details SELECT * FROM _jrd_keep;

SELECT cron.schedule(
  'cleanup-cron-run-details-daily',
  '45 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$$
);