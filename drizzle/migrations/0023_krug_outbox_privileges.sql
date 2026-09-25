REVOKE ALL ON FUNCTION public.krug_notify_outbox_mark_delivered(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.krug_notify_outbox_mark_delivered(text) TO service_role;

-- Outbox je samo servisni: dodijeljena prava iz zadanih privilegija sheme se oduzimaju.
REVOKE ALL ON TABLE public.krug_notify_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.krug_notify_outbox TO service_role;
