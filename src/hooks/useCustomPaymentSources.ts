import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { useAppState } from '@/contexts/AppStateContext';
import { CustomPaymentSource, PaymentSourceCard } from '@/types/customPaymentSource';
import { toast } from 'sonner';
import { useFeatureAccess, FREE_LIMITS } from '@/hooks/useFeatureAccess';


export const useCustomPaymentSources = () => {
  const [customPaymentSources, setCustomPaymentSources] = useState<CustomPaymentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const { onPaymentSourcesReordered, emitPaymentSourcesReordered, activeBusinessProfileId } = useAppState();
  const { hasAccess } = useFeatureAccess();

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

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch own payment sources filtered by business context
      let ownQuery = supabase
        .from('custom_payment_sources' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (activeBusinessProfileId) {
        ownQuery = ownQuery.eq('business_profile_id', activeBusinessProfileId);
      } else {
        ownQuery = ownQuery.is('business_profile_id', null);
      }

      const { data: ownSources, error: ownError } = await ownQuery;

      if (ownError) throw ownError;

      // Fetch shared payment sources via membership
      const { data: memberships, error: memberError } = await supabase
        .from('payment_source_members' as any)
        .select('payment_source_id')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

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

      // Map cards to their sources
      const sourcesWithCards = (sources || []).map((source: any) => ({
        ...source,
        cards: (cards || []).filter((card: any) => card.payment_source_id === source.id)
      }));

      setCustomPaymentSources(sourcesWithCards as CustomPaymentSource[]);
    } catch (error) {
      console.error('Error fetching custom payment sources:', error);
      toast.error('Greška pri dohvaćanju prilagođenih izvora plaćanja');
    } finally {
      setLoading(false);
    }
  }, [user, isLocalMode, activeBusinessProfileId]);

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
      toast.error('Dosegnuli ste limit izvora plaćanja. Nadogradite na Pro za neograničene izvore.');
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
      toast.success('Izvor plaćanja dodan');
      return newSource;
    }

    if (!user) {
      toast.error('Morate biti prijavljeni');
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
      toast.success('Izvor plaćanja dodan');
      return newSource;
    } catch (error) {
      console.error('Error adding custom payment source:', error);
      toast.error('Greška pri dodavanju izvora plaćanja');
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
      toast.success('Izvor plaćanja ažuriran');
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
      toast.success('Izvor plaćanja ažuriran');
    } catch (error) {
      console.error('Error updating custom payment source:', error);
      toast.error('Greška pri ažuriranju izvora plaćanja');
    }
  };

  const deleteCustomPaymentSource = async (id: string) => {
    if (isLocalMode) {
      const updated = customPaymentSources.filter(src => src.id !== id);
      setCustomPaymentSources(updated);
      localStorage.setItem('customPaymentSources', JSON.stringify(updated));
      toast.success('Izvor plaćanja obrisan');
      return;
    }

    try {
      const { error } = await supabase
        .from('custom_payment_sources' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setCustomPaymentSources(prev => prev.filter(src => src.id !== id));
      toast.success('Izvor plaćanja obrisan');
    } catch (error) {
      console.error('Error deleting custom payment source:', error);
      toast.error('Greška pri brisanju izvora plaćanja');
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
      toast.error('Morate biti prijavljeni');
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
      toast.error('Greška pri dodavanju kartice');
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
      toast.error('Greška pri ažuriranju kartice');
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
      toast.error('Greška pri brisanju kartice');
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
      toast.error('Greška pri preslagivanju izvora plaćanja');
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
