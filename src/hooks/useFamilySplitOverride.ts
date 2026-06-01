import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

export interface SplitMemberOption {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SplitOverrideContext {
  groupId: string;
  groupName: string;
  members: SplitMemberOption[];
}

/**
 * Resolves the family group context for a given expense based on its payment_source.
 * Returns null when the expense is not on a shared family source.
 */
export function useFamilySplitContext(paymentSource: string | null | undefined) {
  const [context, setContext] = useState<SplitOverrideContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!paymentSource || !paymentSource.startsWith('custom:')) {
        setContext(null);
        return;
      }
      const sourceId = paymentSource.slice(7);
      setLoading(true);
      try {
        const { data: shared } = await supabase
          .from('family_shared_sources')
          .select('group_id, family_groups!inner(id, name)')
          .eq('payment_source_id', sourceId)
          .maybeSingle();

        if (!shared || cancelled) {
          setContext(null);
          return;
        }

        const groupId = (shared as any).group_id as string;
        const groupName = (shared as any).family_groups?.name ?? '';

        const { data: members } = await supabase
          .from('family_members')
          .select('user_id')
          .eq('group_id', groupId);

        const userIds = (members ?? []).map((m: any) => m.user_id);
        let profiles: any[] = [];
        if (userIds.length) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', userIds);
          profiles = profs ?? [];
        }

        const opts: SplitMemberOption[] = userIds.map((uid) => {
          const p = profiles.find((pp) => pp.user_id === uid);
          return {
            user_id: uid,
            display_name: p?.display_name ?? null,
            avatar_url: p?.avatar_url ?? null,
          };
        });

        if (!cancelled) setContext({ groupId, groupName, members: opts });
      } catch (e) {
        if (!cancelled) setContext(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    resolve();
    return () => {
      cancelled = true;
    };
  }, [paymentSource]);

  return { context, loading };
}

/**
 * Wraps the apply_split_override RPC with toasts + i18n.
 */
export function useFamilySplitOverride() {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const apply = useCallback(
    async (expenseId: string, overrides: Record<string, number> | null) => {
      setSaving(true);
      try {
        const { error } = await supabase.rpc('apply_split_override', {
          p_expense_id: expenseId,
          p_overrides: overrides as any,
        });
        if (error) throw error;
        showSuccess(
          overrides
            ? t('family.split.override.applied')
            : t('family.split.override.removed'),
        );
        return true;
      } catch (e: any) {
        showError(t('family.split.override.error'), e?.message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [t],
  );

  return { apply, saving };
}
