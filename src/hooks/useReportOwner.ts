// Resolve the current user's display name for report headers + file names.
// Order: profiles.full_name → email local-part (capitalised) → empty string.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatOwnerName } from '@/lib/reportDesign';

let cached: string | null = null;
let inFlight: Promise<string> | null = null;

const fetchOwner = async (): Promise<string> => {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return '';
    let fullName: string | null = null;
    try {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      fullName = (data as any)?.full_name || null;
    } catch { /* table may be unavailable; fall back */ }
    return formatOwnerName(fullName, user.email);
  } catch {
    return '';
  }
};

/** Imperative getter — caches result for the session. Safe in non-React code. */
export const getReportOwner = async (): Promise<string> => {
  if (cached !== null) return cached;
  if (!inFlight) inFlight = fetchOwner().then(v => { cached = v; return v; });
  return inFlight;
};

export const useReportOwner = (): string => {
  const [owner, setOwner] = useState<string>(cached || '');
  useEffect(() => {
    let active = true;
    getReportOwner().then(v => { if (active) setOwner(v); });
    return () => { active = false; };
  }, []);
  return owner;
};
