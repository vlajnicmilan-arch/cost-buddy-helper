import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category, PaymentSource, ReceiptItem } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { LocalFileCache } from './useLocalFileCache';
import { LocalStorage } from './useLocalStorage';
import { logDiagnostic } from '@/lib/diagnosticLogger';

interface ParsedReceipt {
  amount: number;
  merchant: string;
  description: string;
  category: Category;
  date: string | null;
  payment_source: PaymentSource | null;
  custom_payment_source_id: string | null;
  payment_source_card_id: string | null;
  items: ReceiptItem[];
  is_installment: boolean;
  installment_count: number | null;
  installment_amount: number | null;
  transaction_type: 'expense' | 'transfer' | 'income';
  transfer_destination_name: string | null;
  recipient_name: string | null;
  issuer_name: string | null;
  issuer_oib: string | null;
  vat_rate: number | null;
  vat_amount: number | null;
}

const isAbortLikeError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('aborterror') ||
    message.includes('signal is aborted') ||
    message.includes('aborted without reason') ||
    message.includes('user aborted')
  );
};

// Kompresija slike za mobilne uređaje - smanjuje veličinu za stabilnije slanje
const compressImage = async (base64: string, maxWidth = 800, quality = 0.75): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      console.error('Failed to load image for compression');
      resolve(base64);
    };
    img.src = base64;
  });
};

export const useReceiptScanner = () => {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);

  const scanReceipt = async (
    imageBase64: string, 
    customPaymentSources?: CustomPaymentSource[],
    customCategories?: { id: string; name: string; icon: string }[]
  ): Promise<ParsedReceipt | null> => {
    return scanMultipleReceipts([imageBase64], customPaymentSources, customCategories);
  };

  const scanMultipleReceipts = async (
    imagesBase64: string[],
    customPaymentSources?: CustomPaymentSource[],
    customCategories?: { id: string; name: string; icon: string }[]
  ): Promise<ParsedReceipt | null> => {
    setScanning(true);
    setParsedData(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        showError('AI skeniranje računa zahtijeva cloud način rada i prijavu. Možeš ručno unijeti podatke.');
        return null;
      }

      // Compress all images
      const compressedImages = await Promise.all(
        imagesBase64.map(img => compressImage(img))
      );

      // Prepare custom payment sources for the API
      const sourcesForApi = customPaymentSources?.map(src => ({
        id: src.id,
        name: src.name,
        cards: src.cards?.map(card => ({
          id: card.id,
          card_name: card.card_name,
          last_four_digits: card.last_four_digits,
          card_type: card.card_type
        })) || []
      })) || [];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({ 
            imagesBase64: compressedImages,
            customPaymentSources: sourcesForApi,
            customCategories: customCategories || []
          })
        }
      );

      

      if (response.status === 429) {
        showError('Previše zahtjeva. Pokušaj ponovno za minutu.');
        return null;
      }

      if (response.status === 402) {
        showError('Nedostaje kredita za AI obradu.');
        return null;
      }

      if (!response.ok) {
        let errorMessage = t('toasts.scanError');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          console.error('Failed to parse error response');
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Map payment_method from AI to PaymentSource
      let paymentSource: PaymentSource | null = null;
      if (data.custom_payment_source_id) {
        paymentSource = `custom:${data.custom_payment_source_id}` as PaymentSource;
      } else if (data.payment_method === 'card') {
        paymentSource = 'bank';
      } else if (data.payment_method === 'cash') {
        paymentSource = 'cash';
      }

      const result: ParsedReceipt = {
        amount: data.amount,
        merchant: data.merchant,
        description: (typeof data.description === 'string' && data.description.trim().length > 0)
          ? data.description.trim()
          : ((typeof data.merchant === 'string' && data.merchant.trim().length > 0) ? data.merchant.trim() : 'Račun'),
        category: data.category as Category,
        date: data.date || null,
        payment_source: paymentSource,
        custom_payment_source_id: data.custom_payment_source_id || null,
        payment_source_card_id: data.payment_source_card_id || null,
        is_installment: data.is_installment || false,
        installment_count: data.installment_count || null,
        installment_amount: data.installment_amount || null,
        transaction_type: data.transaction_type || 'expense',
        transfer_destination_name: data.transfer_destination_name || null,
        recipient_name: data.recipient_name || null,
        issuer_name: data.issuer_name || data.merchant || null,
        issuer_oib: data.issuer_oib || null,
        vat_rate: data.vat_rate ?? null,
        vat_amount: data.vat_amount ?? null,
        items: (data.items || []).map((item: any) => ({
          name: item.name || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || undefined,
          total_price: item.total_price || 0
        }))
      };

      setParsedData(result);

      // Cache result locally for offline access
      try {
        await LocalStorage.setJSON(`receipt_cache_${Date.now()}`, result);
        // Save first image locally
        if (compressedImages[0]) {
          await LocalFileCache.saveReceiptImage(compressedImages[0]);
        }
      } catch (cacheErr) {
        console.warn('Failed to cache receipt locally:', cacheErr);
      }
      
      // Show different message if custom source was matched
      if (data.custom_payment_source_id) {
        const matchedSource = customPaymentSources?.find(s => s.id === data.custom_payment_source_id);
        showSuccess(`Račun skeniran! Prepoznat izvor: ${matchedSource?.name || 'Prilagođeni izvor'}`);
      } else {
        const pagesNote = imagesBase64.length > 1 ? ` (${imagesBase64.length} stranica)` : '';
        showSuccess(`Račun skeniran${pagesNote}! Pronađeno ${result.items.length} artikala.`);
      }
      return result;
    } catch (error) {
      if (isAbortLikeError(error)) {
        console.warn('Receipt scanning was interrupted:', error);
        showError('Skeniranje je prekinuto. Pokušaj ponovno.');
        return null;
      }

      console.error('Error scanning receipt:', error);
      showError(error instanceof Error ? error.message : 'Greška pri skeniranju računa');
      return null;
    } finally {
      setScanning(false);
    }
  };

  const uploadReceiptImage = async (imageBase64: string): Promise<string | null> => {
    try {
      // Always save locally — no cloud upload
      const fileName = `receipt_${Date.now()}.jpg`;
      const localPath = await LocalFileCache.saveReceiptImage(imageBase64, fileName);
      
      if (localPath) {
        return `local:${localPath}`;
      }

      // Web/PWA fallback: save to IndexedDB via LocalStorage
      const key = `receipt_img_${Date.now()}`;
      await LocalStorage.set(key, imageBase64);
      return `local:${key}`;
    } catch (error) {
      console.error('Error saving receipt image locally:', error);
      return null;
    }
  };

  const clearParsedData = () => {
    setParsedData(null);
  };

  return {
    scanning,
    parsedData,
    scanReceipt,
    scanMultipleReceipts,
    uploadReceiptImage,
    clearParsedData
  };
};
