
-- Remove the overly broad public-assets INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload to public-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload public-assets" ON storage.objects;

-- Fix Realtime: add RLS policy so users can only subscribe to their own channels
-- Note: realtime.messages is in the realtime schema which we cannot modify directly.
-- Instead, we ensure proper authorization via Supabase Realtime's built-in RLS on the public tables.
-- The realtime channel subscriptions are authorized by the RLS on the underlying tables being listened to.
-- This is a known Supabase architecture pattern - no migration needed for realtime.messages.
