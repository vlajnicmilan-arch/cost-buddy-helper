import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useAppState } from '@/contexts/AppStateContext';
import { CustomPaymentSource, PaymentSourceCard } from '@/types/customPaymentSource';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useFeatureAccess, FREE_LIMITS } from '@/hooks/useFeatureAccess';
import { tr } from '@/lib/errorMessages';
import { instantCache } from '@/lib/instantCache';

const paymentSourcesCacheKey = (
  userId: string | undefined,
  businessProfileId: string | null | undefined,
  includePersonal: boolean,
) => `paymentSources:v1:${userId || 'anon'}:${businessProfileId || 'personal'}:${includePersonal ? 'incl' : 'excl'}`;


interface UseCustomPaymentSourcesOptions {
  /**
   * When true and the user is in business mode, also returns personal payment sources
   * (sources with business_profile_id = null). Used for owner-loan flows where a
   * business expense can be paid from a personal account.
   */
  includePersonal?: boolean;
}

export const useCustomPaymentSources = (options: UseCustomPaymentSourcesOptions = {}) => {
  const { t } = useTranslation();
  const { includePersonal = false } = options;
  const { user, authReady } = useAuth();
  const { storageMode } = useStorage();
  const { onPaymentSourcesReordered, emitPaymentSourcesReordered, activeBusinessProfileId } = useAppState();
  const { hasAccess } = useFeatureAccess();
  const initialKey = paymentSourcesCacheKey(user?.id, activeBusinessProfileId, includePersonal);
  const initialCached = user ? instantCache.read<CustomPaymentSource[]>(initialKey) : null;
  const [customPaymentSources, setCustomPaymentSources] = useState<CustomPaymentSource[]>(initialCached || []);
  const [loading, setLoading] = useState(!initialCached || initialCached.length === 0);
  const hydratedKeyRef = useRef<string | null>(initialCached && initialCached.length > 0 ? initialKey : null);
  // Tracks the latest in-flight fetch so we can ignore stale results (deps
  // changed mid-fetch) without logging them as errors. Using a request id
  // instead of AbortController because supabase-js does not expose abort.
  const fetchSeqRef = useRef(0);

  const isLocalMode = storageMode === 'local' && !user;


  const fetchCustomPaymentSources = useCallback(async () => {
    if (isLocalMode) {
      const stored = localStorage.getItem('customPaymentSources');
      if (stored) {
        const parsed = JSON.parse(stored) as CustomPaymentSource[];
        // Sort by sort_order for local mode as well
        parsed.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setCustomPaymentSources(parsed);
      }
      setLoading(false);
      return;
    }

    // Wait for the auth session to finish restoring before any cloud query.
    // Without this gate, the hook would race the session restore, fire a
    // fetch with no JWT, and the request would be aborted by the next render
    // — producing AbortError + retry loops.
    if (!authReady) {
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    const mySeq = ++fetchSeqRef.current;
    const isStale = () => mySeq !== fetchSeqRef.current;


    try {
      // Fetch own payment sources filtered by business context
      let ownQuery = supabase
        .from('custom_payment_sources' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (activeBusinessProfileId) {
        if (includePersonal) {
          // Business mode + cross-mode flow: include both business + personal sources
          ownQuery = ownQuery.or(`business_profile_id.eq.${activeBusinessProfileId},business_profile_id.is.null`);
        } else {
          ownQuery = ownQuery.eq('business_profile_id', activeBusinessProfileId);
        }
      } else {
        ownQuery = ownQuery.is('business_profile_id', null);
      }

      const { data: ownSources, error: ownError } = await ownQuery;

      if (ownError) throw ownError;

      if (ownError) throw ownError;

      // Fetch shared payment sources via membership (including role for current user)
      const { data: memberships, error: memberError } = await supabase
        .from('payment_source_members' as any)
        .select('payment_source_id, role')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const myRoleMap = new Map<string, string>();
      (memberships || []).forEach((m: any) => myRoleMap.set(m.payment_source_id, m.role));

      const memberSourceIds = (memberships || [])
        .map((m: any) => m.payment_source_id)
        .filter((id: string) => !(ownSources || []).some((s: any) => s.id === id));


      let sharedSources: any[] = [];
      if (memberSourceIds.length > 0) {
        const { data: shared, error: sharedError } = await supabase
          .from('custom_payment_sources' as any)
          .select('*')
          .in('id', memberSourceIds)
          .order('sort_order', { ascending: true });

        if (sharedError) throw sharedError;
        sharedSources = shared || [];
      }

      const sources = [...(ownSources || []), ...sharedSources];

      // Fetch cards for all sources
      const sourceIds = sources.map((s: any) => s.id);
      let cards: any[] = [];
      if (sourceIds.length > 0) {
        const { data: cardsData, error: cardsError } = await supabase
          .from('payment_source_cards' as any)
          .select('*')
          .in('payment_source_id', sourceIds);

        if (cardsError) throw cardsError;
        cards = cardsData || [];
      }

      // Fetch member counts for all sources (used to show "Shared" badge)
      let allMemberships: any[] = [];
      if (sourceIds.length > 0) {
        const { data: membersData } = await supabase
          .from('payment_source_members' as any)
          .select('payment_source_id, user_id')
          .in('payment_source_id', sourceIds);
        allMemberships = membersData || [];
      }

      // Fetch owner display names for shared sources (where I'm not the owner)
      const sharedOwnerIds = Array.from(
        new Set(sharedSources.map((s: any) => s.user_id).filter(Boolean))
      );
      let ownerProfiles: any[] = [];
      if (sharedOwnerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles' as any)
          .select('user_id, display_name')
          .in('user_id', sharedOwnerIds);
        ownerProfiles = profilesData || [];
      }

      // Map cards + sharing metadata to their sources
      const sourcesWithCards = (sources || []).map((source: any) => {
        const sourceMembers = allMemberships.filter((m: any) => m.payment_source_id === source.id);
        // memberCount = members other than the owner
        const memberCount = sourceMembers.filter((m: any) => m.user_id !== source.user_id).length;
        const isOwned = source.user_id === user.id;
        const ownerName = !isOwned
          ? (ownerProfiles.find((p: any) => p.user_id === source.user_id)?.display_name || null)
          : null;
        return {
          ...source,
          cards: (cards || []).filter((card: any) => card.payment_source_id === source.id),
          isOwned,
          memberCount,
          ownerName,
        };
      });

      if (isStale()) return;

      const finalSources = sourcesWithCards as CustomPaymentSource[];
      setCustomPaymentSources(finalSources);
      if (!isLocalMode && user) {
        instantCache.write(
          paymentSourcesCacheKey(user.id, activeBusinessProfileId, includePersonal),
          finalSources,
        );
        hydratedKeyRef.current = paymentSourcesCacheKey(user.id, activeBusinessProfileId, includePersonal);
      }
    } catch (error) {
      // A stale fetch (deps changed mid-flight) is not an error — silently skip.
      if (isStale()) return;

      const errMsg = String((error as any)?.message || error);
      const status = (error as any)?.status;
      const isAbort = /abort/i.test(errMsg) || (error as any)?.name === 'AbortError';
      const isAuthError = /jwt|token.*expir|unauthorized/i.test(errMsg) || status === 401;
      const isTransient =
        /network|fetch failed|failed to fetch|timeout|timed out|load failed|networkerror/i.test(errMsg) ||
        (typeof status === 'number' && status >= 500 && status <= 599);

      // AbortError without auth/transient signal = cancelled request, ignore.
      if (isAbort && !isAuthError && !isTransient) {
        return;
      }

      if (isAuthError) {
        console.log('[PaymentSources] Auth error, refreshing session and retrying...');
        try {
          await supabase.auth.refreshSession();
          setTimeout(() => fetchCustomPaymentSources(), 500);
          return;
        } catch (retryErr) {
          console.error('Session refresh failed:', retryErr);
        }
      }

      if (isTransient || isAuthError) {
        // Graceful degrade: don't toast, don't clear state. Silent background retry once.
        console.warn('[PaymentSources] Transient fetch error, retrying silently:', errMsg);
        try {
          const { logDiagnostic } = await import('@/lib/diagnosticLogger');
          logDiagnostic({
            event: 'payment_sources_fetch_transient_error',
            severity: 'warning',
            details: { message: errMsg, status: status ?? null, is_auth: isAuthError },
          });
        } catch {}
        setTimeout(() => fetchCustomPaymentSources(), 800);
        return;
      }

      console.error('Error fetching custom payment sources:', error);
      showError(tr('errors.fetch.sources', 'Greška pri dohvaćanju prilagođenih izvora plaćanja'));
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [user, isLocalMode, activeBusinessProfileId, includePersonal, authReady]);

  // Hydrate from cache instantly when context changes
  useEffect(() => {
    if (isLocalMode || !user) return;
    const key = paymentSourcesCacheKey(user.id, activeBusinessProfileId, includePersonal);
    const cached = instantCache.read<CustomPaymentSource[]>(key);
    if (cached && cached.length > 0) {
      setCustomPaymentSources(cached);
      setLoading(false);
      hydratedKeyRef.current = key;
    } else {
      hydratedKeyRef.current = null;
    }
  }, [user?.id, activeBusinessProfileId, includePersonal, isLocalMode, user]);

  useEffect(() => {
    fetchCustomPaymentSources();
  }, [fetchCustomPaymentSources]);

  // Subscribe to reorder events via Context to sync state across hook instances
  useEffect(() => {
    const unsubscribe = onPaymentSourcesReordered((sources) => {
      setCustomPaymentSources(sources);
    });
    return unsubscribe;
  }, [onPaymentSourcesReordered]);


  const addCustomPaymentSource = async (source: Omit<CustomPaymentSource, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    // Check free tier payment source limit
    if (!hasAccess('unlimited_payment_sources') && customPaymentSources.length >= FREE_LIMITS.payment_sources) {
      showError(tr('errors.limits.paymentSources', 'Dosegnuli ste limit izvora plaćanja. Nadogradite na Pro za neograničene izvore.'));
      return null;
    }

    if (isLocalMode) {
      const maxSortOrder = customPaymentSources.reduce((max, src) => Math.max(max, src.sort_order || 0), -1);
      const newSource: CustomPaymentSource = {
        ...source,
        id: crypto.randomUUID(),
        user_id: 'local',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sort_order: maxSortOrder + 1,
      };
      const updated = [...customPaymentSources, newSource];
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      showSuccess(t('toasts.paymentSourceAdded'));
      return newSource;
    }

    if (!user) {
      showError(tr('errors.mustBeLoggedIn', 'Morate biti prijavljeni'));
      return null;
    }

    try {
      // Get max sort_order for this user
      const maxSortOrder = customPaymentSources.reduce((max, src) => Math.max(max, src.sort_order || 0), -1);
      const { cards, ...sourceData } = source;
      const { data, error } = await supabase
        .from('custom_payment_sources' as any)
        .insert({
          ...sourceData,
          user_id: user.id,
          sort_order: maxSortOrder + 1,
          business_profile_id: activeBusinessProfileId || null,
        })
        .select()
        .single();

      if (error) throw error;
      const newSource = { ...(data as object), cards: [] } as CustomPaymentSource;
      setCustomPaymentSources(prev => [...prev, newSource]);
      showSuccess(t('toasts.paymentSourceAdded'));
      return newSource;
    } catch (error) {
      console.error('Error adding custom payment source:', error);
      showError(tr('errors.create.source', 'Greška pri dodavanju izvora plaćanja'));
      return null;
    }
  };

  const updateCustomPaymentSource = async (id: string, updates: Partial<Omit<CustomPaymentSource, 'id' | 'user_id' | 'created_at'>>) => {
    if (isLocalMode) {
      const updated = customPaymentSources.map(src =>
        src.id === id ? { ...src, ...updates, updated_at: new Date().toISOString() } : src
      );
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      showSuccess(t('toasts.paymentSourceUpdated'));
      return;
    }

    try {
      const { cards, ...sourceData } = updates;
      const { error } = await supabase
        .from('custom_payment_sources' as any)
        .update(sourceData)
        .eq('id', id);

      if (error) throw error;
      setCustomPaymentSources(prev =>
        prev.map(src => (src.id === id ? { ...src, ...updates } : src))
      );
      showSuccess(t('toasts.paymentSourceUpdated'));
    } catch (error) {
      console.error('Error updating custom payment source:', error);
      showError(tr('errors.update.source', 'Greška pri ažuriranju izvora plaćanja'));
    }
  };

  const deleteCustomPaymentSource = async (id: string) => {
    if (isLocalMode) {
      const updated = customPaymentSources.filter(src => src.id !== id);
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      showSuccess(t('toasts.paymentSourceDeleted'));
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_payment_sources' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setCustomPaymentSources(prev => prev.filter(src => src.id !== id));
      showSuccess(t('toasts.paymentSourceDeleted'));
    } catch (error) {
      console.error('Error deleting custom payment source:', error);
      showError(tr('errors.delete.source', 'Greška pri brisanju izvora plaćanja'));
    }
  };

  // Card management functions
  const addCard = async (paymentSourceId: string, card: Omit<PaymentSourceCard, 'id' | 'payment_source_id' | 'user_id' | 'created_at'>) => {
    if (isLocalMode) {
      const newCard: PaymentSourceCard = {
        ...card,
        id: crypto.randomUUID(),
        payment_source_id: paymentSourceId,
        user_id: 'local',
        created_at: new Date().toISOString(),
      };
      const updated = customPaymentSources.map(src =>
        src.id === paymentSourceId 
          ? { ...src, cards: [...(src.cards || []), newCard] }
          : src
      );
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      return newCard;
    }

    if (!user) {
      showError(tr('errors.mustBeLoggedIn', 'Morate biti prijavljeni'));
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('payment_source_cards' as any)
        .insert({
          ...card,
          payment_source_id: paymentSourceId,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      const newCard = data as unknown as PaymentSourceCard;
      setCustomPaymentSources(prev =>
        prev.map(src =>
          src.id === paymentSourceId
            ? { ...src, cards: [...(src.cards || []), newCard] }
            : src
        )
      );
      return newCard;
    } catch (error) {
      console.error('Error adding card:', error);
      showError(tr('errors.create.card', 'Greška pri dodavanju kartice'));
      return null;
    }
  };

  const updateCard = async (cardId: string, updates: Partial<Pick<PaymentSourceCard, 'card_name' | 'last_four_digits' | 'card_type'>>) => {
    if (isLocalMode) {
      const updated = customPaymentSources.map(src => ({
        ...src,
        cards: (src.cards || []).map(card =>
          card.id === cardId ? { ...card, ...updates } : card
        )
      }));
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      return;
    }

    try {
      const { error } = await supabase
        .from('payment_source_cards' as any)
        .update(updates)
        .eq('id', cardId);

      if (error) throw error;
      setCustomPaymentSources(prev =>
        prev.map(src => ({
          ...src,
          cards: (src.cards || []).map(card =>
            card.id === cardId ? { ...card, ...updates } : card
          )
        }))
      );
    } catch (error) {
      console.error('Error updating card:', error);
      showError(tr('errors.update.card', 'Greška pri ažuriranju kartice'));
    }
  };

  const deleteCard = async (cardId: string) => {
    if (isLocalMode) {
      const updated = customPaymentSources.map(src => ({
        ...src,
        cards: (src.cards || []).filter(card => card.id !== cardId)
      }));
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      return;
    }

    try {
      const { error } = await supabase
        .from('payment_source_cards' as any)
        .delete()
        .eq('id', cardId);

      if (error) throw error;
      setCustomPaymentSources(prev =>
        prev.map(src => ({
          ...src,
          cards: (src.cards || []).filter(card => card.id !== cardId)
        }))
      );
    } catch (error) {
      console.error('Error deleting card:', error);
      showError(tr('errors.delete.card', 'Greška pri brisanju kartice'));
    }
  };

  const reorderPaymentSources = async (reorderedSources: CustomPaymentSource[]) => {
    // Update sort_order values and local state immediately for smooth UX
    const updatedWithOrder = reorderedSources.map((src, index) => ({ ...src, sort_order: index }));
    setCustomPaymentSources(updatedWithOrder);

    // Emit reorder event via Context for other hook instances to sync
    emitPaymentSourcesReordered(updatedWithOrder);


    if (isLocalMode) {
      localStorage.setItem('customPaymentSources', JSON.stringify(updatedWithOrder));
      return;
    }

    try {
      // Update sort_order for each source in the database
      const updates = reorderedSources.map((src, index) => 
        supabase
          .from('custom_payment_sources' as any)
          .update({ sort_order: index })
          .eq('id', src.id)
      );
      
      await Promise.all(updates);
    } catch (error) {
      console.error('Error reordering payment sources:', error);
      showError(tr('errors.update.reorder', 'Greška pri preslagivanju izvora plaćanja'));
      // Refetch to restore correct order on error
      fetchCustomPaymentSources();
    }
  };

  // Owned sources only (exclude shared where user is just a member)
  const ownedPaymentSources = customPaymentSources.filter(src => 
    isLocalMode || !user ? true : src.user_id === user.id
  );

  // Shared sources only (where user is member but not owner)
  const sharedPaymentSources = customPaymentSources.filter(src =>
    !isLocalMode && user ? src.user_id !== user.id : false
  );

  return {
    customPaymentSources,
    ownedPaymentSources,
    sharedPaymentSources,
    loading,
    addCustomPaymentSource,
    updateCustomPaymentSource,
    deleteCustomPaymentSource,
    addCard,
    updateCard,
    deleteCard,
    reorderPaymentSources,
    refetch: fetchCustomPaymentSources,
  };
};
