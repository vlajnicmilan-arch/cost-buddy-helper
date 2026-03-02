import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCustomCategories } from './useCustomCategories';

export const useAICategorization = () => {
  const { customCategories } = useCustomCategories();
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categorize = useCallback(
    (
      description: string,
      merchantName: string,
      onResult: (category: string) => void,
      items?: { name: string; quantity?: number; total_price?: number }[]
    ) => {
      // Clear previous debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();

      const text = (description + ' ' + merchantName).trim();
      if (text.length < 3 && (!items || items.length === 0)) return;

      debounceRef.current = setTimeout(async () => {
        try {
          const customCatNames = customCategories.map(c => c.name);

          const { data, error } = await supabase.functions.invoke('categorize-transaction', {
            body: {
              description,
              merchant_name: merchantName,
              custom_categories: customCatNames,
              items: items?.map(i => ({ name: i.name })),
            },
          });

          if (error) {
            console.error('[AICategorization] Error:', error);
            return;
          }

          if (data?.category) {
            onResult(data.category);
          }
        } catch (err) {
          // Silently ignore - this is a convenience feature
          console.error('[AICategorization] Error:', err);
        }
      }, 800); // 800ms debounce
    },
    [customCategories]
  );

  const cancel = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
  }, []);

  return { categorize, cancel };
};
