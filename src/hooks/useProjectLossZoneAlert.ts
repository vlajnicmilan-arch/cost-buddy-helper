/**
 * Triggers an in-app notification when a project enters the "loss zone"
 * (spent >= 90% of contract_value, i.e. less than 10% margin remaining).
 *
 * Throttle: max 1 alert per project per 24h (checked against notifications table).
 * Uses existing `notifications` table — drives badge + dropdown like every other
 * in-app notification. No edge function required.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Params {
  projectId: string | null | undefined;
  projectName: string | undefined;
  contractValue: number | null | undefined;
  spent: number;
}

const ALERT_TYPE = 'project_loss_zone';

export const useProjectLossZoneAlert = ({ projectId, projectName, contractValue, spent }: Params) => {
  const { user } = useAuth();
  const lastCheckedRef = useRef<string>('');

  useEffect(() => {
    if (!user || !projectId || !projectName) return;
    const contract = Number(contractValue || 0);
    if (contract <= 0) return;

    const remainingMarginPct = ((contract - spent) / contract) * 100;
    if (remainingMarginPct >= 10) return; // not in loss zone

    // De-dupe per render cycle — only re-evaluate when key inputs change
    const key = `${projectId}:${spent}:${contract}`;
    if (lastCheckedRef.current === key) return;
    lastCheckedRef.current = key;

    let cancelled = false;

    (async () => {
      // Throttle: check if same alert exists for this project in last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing, error: selErr } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', ALERT_TYPE)
        .gte('created_at', since)
        .contains('data', { project_id: projectId })
        .limit(1);

      if (selErr || cancelled) return;
      if (existing && existing.length > 0) return;

      const pct = Math.max(0, remainingMarginPct).toFixed(1);
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: ALERT_TYPE,
        title: `⚠️ ${projectName}`,
        message: `Projekt ulazi u zonu gubitka — preostalo samo ${pct}% marže`,
        data: {
          project_id: projectId,
          project_name: projectName,
          margin_pct: Number(pct),
          contract_value: contract,
          spent,
        },
      });
    })();

    return () => { cancelled = true; };
  }, [user, projectId, projectName, contractValue, spent]);
};
