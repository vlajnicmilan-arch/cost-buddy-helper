import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type PushCategory =
  | 'chat'
  | 'transactions'
  | 'pending'
  | 'projects'
  | 'budgets'
  | 'reminders'
  | 'trial'
  | 'broadcast'
  | 'daily_summary';

export interface NotificationPreferences {
  chat_enabled: boolean;
  transactions_enabled: boolean;
  pending_enabled: boolean;
  projects_enabled: boolean;
  budgets_enabled: boolean;
  reminders_enabled: boolean;
  trial_enabled: boolean;
  broadcast_enabled: boolean;
  daily_summary_enabled: boolean;
  daily_summary_weekend_enabled: boolean;
  family_override_push: boolean;
  family_reactions_push: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  chat_enabled: true,
  transactions_enabled: true,
  pending_enabled: true,
  projects_enabled: true,
  budgets_enabled: true,
  reminders_enabled: true,
  trial_enabled: true,
  broadcast_enabled: true,
  daily_summary_enabled: true,
  daily_summary_weekend_enabled: true,
  family_override_push: false,
  family_reactions_push: false,
};

const COL_BY_CATEGORY: Record<PushCategory, keyof NotificationPreferences> = {
  chat: 'chat_enabled',
  transactions: 'transactions_enabled',
  pending: 'pending_enabled',
  projects: 'projects_enabled',
  budgets: 'budgets_enabled',
  reminders: 'reminders_enabled',
  trial: 'trial_enabled',
  broadcast: 'broadcast_enabled',
  daily_summary: 'daily_summary_enabled',
};

export const useNotificationPreferences = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  const fetchPrefs = useCallback(async () => {
    if (!user) {
      setPrefs(DEFAULT_PREFS);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setPrefs({
          chat_enabled: data.chat_enabled,
          transactions_enabled: data.transactions_enabled,
          pending_enabled: data.pending_enabled,
          projects_enabled: data.projects_enabled,
          budgets_enabled: data.budgets_enabled,
          reminders_enabled: data.reminders_enabled,
          trial_enabled: data.trial_enabled,
          broadcast_enabled: data.broadcast_enabled,
          daily_summary_enabled: data.daily_summary_enabled ?? true,
          daily_summary_weekend_enabled: data.daily_summary_weekend_enabled ?? true,
          family_override_push: data.family_override_push ?? false,
          family_reactions_push: data.family_reactions_push ?? false,
        });
      } else {
        setPrefs(DEFAULT_PREFS);
      }
    } catch (e) {
      console.error('[notif-prefs] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  // Reset "unopened streak" za dnevni sažetak svaki put kad korisnik otvori app.
  // Sprječava auto-pauzu od strane edge funkcije za korisnike koji aktivno koriste app.
  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from('notification_preferences')
      .update({ daily_summary_unopened_streak: 0 })
      .eq('user_id', user.id)
      .then(() => { /* best-effort */ }, () => { /* ignore */ });
  }, [user]);

  const setCategory = useCallback(async (category: PushCategory, enabled: boolean) => {
    if (!user) return;
    const col = COL_BY_CATEGORY[category];
    setPrefs((p) => ({ ...p, [col]: enabled }));
    try {
      await (supabase as any)
        .from('notification_preferences')
        .upsert(
          { user_id: user.id, ...prefs, [col]: enabled },
          { onConflict: 'user_id' }
        );
    } catch (e) {
      console.error('[notif-prefs] update failed:', e);
      setPrefs((p) => ({ ...p, [col]: !enabled }));
    }
  }, [user, prefs]);

  const setWeekendEnabled = useCallback(async (enabled: boolean) => {
    if (!user) return;
    setPrefs((p) => ({ ...p, daily_summary_weekend_enabled: enabled }));
    try {
      await (supabase as any)
        .from('notification_preferences')
        .upsert(
          { user_id: user.id, ...prefs, daily_summary_weekend_enabled: enabled },
          { onConflict: 'user_id' }
        );
    } catch (e) {
      console.error('[notif-prefs] weekend update failed:', e);
      setPrefs((p) => ({ ...p, daily_summary_weekend_enabled: !enabled }));
    }
  }, [user, prefs]);

  return { prefs, loading, setCategory, setWeekendEnabled, refetch: fetchPrefs };
};
