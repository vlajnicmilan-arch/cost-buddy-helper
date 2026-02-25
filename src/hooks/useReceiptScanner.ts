import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category, PaymentSource, ReceiptItem } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { toast } from 'sonner';

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
  transaction_type: 'expense' | 'transfer';
  transfer_destination_name: string | null;
}

// Kompresija slike za mobilne uređaje
const compressImage = async (base64: string, maxWidth = 800, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
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
      if (!ctx) { resolve(base64); return; }
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

function mapPaymentSource(data: any, customPaymentSources?: CustomPaymentSource[]): PaymentSource | null {
  if (data.custom_payment_source_id) {
    return `custom:${data.custom_payment_source_id}` as PaymentSource;
  } else if (data.payment_method === 'card') {
    return 'bank';
  } else if (data.payment_method === 'cash') {
    return 'cash';
  }
  return null;
}

function buildResult(data: any): ParsedReceipt {
  return {
    amount: data.amount,
    merchant: data.merchant,
    description: data.description,
    category: data.category as Category,
    date: data.date || null,
    payment_source: mapPaymentSource(data),
    custom_payment_source_id: data.custom_payment_source_id || null,
    payment_source_card_id: data.payment_source_card_id || null,
    is_installment: data.is_installment || false,
    installment_count: data.installment_count || null,
    installment_amount: data.installment_amount || null,
    transaction_type: data.transaction_type || 'expense',
    transfer_destination_name: data.transfer_destination_name || null,
    items: (data.items || []).map((item: any) => ({
      name: item.name || '',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || undefined,
      total_price: item.total_price || 0
    }))
  };
}

export const useReceiptScanner = () => {
  const [scanning, setScanning] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);
  const [streamedItems, setStreamedItems] = useState<ReceiptItem[]>([]);
  const [streamStatus, setStreamStatus] = useState<string>('');

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
    setStreamedItems([]);
    setStreamStatus('Komprimiram slike...');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        toast.error('AI skeniranje računa zahtijeva cloud način rada i prijavu.');
        return null;
      }

      const compressedImages = await Promise.all(
        imagesBase64.map(img => compressImage(img))
      );

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

      setStreamStatus('Šaljem na analizu...');

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
        toast.error('Previše zahtjeva. Pokušaj ponovno za minutu.');
        return null;
      }
      if (response.status === 402) {
        toast.error('Nedostaje kredita za AI obradu.');
        return null;
      }
      if (!response.ok) {
        let errorMessage = 'Greška pri skeniranju';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch { /* ignore */ }
        throw new Error(errorMessage);
      }

      // === STREAMING SSE PARSING ===
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ParsedReceipt | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.trim() === '') continue;

          // Parse SSE event type
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim();
            // Read the next data line
            const dataIdx = buffer.indexOf('\n');
            if (dataIdx === -1) {
              // Put back and wait for more data
              buffer = line + '\n' + buffer;
              break;
            }
            let dataLine = buffer.slice(0, dataIdx);
            buffer = buffer.slice(dataIdx + 1);
            if (dataLine.endsWith('\r')) dataLine = dataLine.slice(0, -1);

            if (dataLine.startsWith('data: ')) {
              const jsonStr = dataLine.slice(6);
              try {
                const data = JSON.parse(jsonStr);

                if (eventType === 'status') {
                  setStreamStatus(data.message || '');
                } else if (eventType === 'item') {
                  const newItem: ReceiptItem = {
                    name: data.name || '',
                    quantity: data.quantity || 1,
                    unit_price: data.unit_price || undefined,
                    total_price: data.total_price || 0
                  };
                  setStreamedItems(prev => [...prev, newItem]);
                } else if (eventType === 'complete') {
                  finalResult = buildResult(data);
                  setParsedData(finalResult);
                } else if (eventType === 'error') {
                  throw new Error(data.error || 'Greška pri analizi');
                }
              } catch (e) {
                if (eventType === 'error') throw e;
                // Ignore parse errors for partial data
              }
            }
            continue;
          }
        }
      }

      if (finalResult) {
        if (finalResult.custom_payment_source_id) {
          const matchedSource = customPaymentSources?.find(s => s.id === finalResult!.custom_payment_source_id);
          toast.success(`Račun skeniran! Prepoznat izvor: ${matchedSource?.name || 'Prilagođeni izvor'}`);
        } else {
          const pagesNote = imagesBase64.length > 1 ? ` (${imagesBase64.length} stranica)` : '';
          toast.success(`Račun skeniran${pagesNote}! Pronađeno ${finalResult.items.length} artikala.`);
        }
      }

      return finalResult;
    } catch (error) {
      console.error('Error scanning receipt:', error);
      toast.error(error instanceof Error ? error.message : 'Greška pri skeniranju računa');
      return null;
    } finally {
      setScanning(false);
      setStreamStatus('');
    }
  };

  const uploadReceiptImage = async (imageBase64: string): Promise<string | null> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return null;

      const userId = sessionData.session.user.id;
      const fileName = `${userId}/${Date.now()}.jpg`;
      
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const { error } = await supabase.storage
        .from('receipts')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

      if (error) { console.error('Error uploading receipt:', error); return null; }
      return fileName;
    } catch (error) {
      console.error('Error uploading receipt image:', error);
      return null;
    }
  };

  const clearParsedData = useCallback(() => {
    setParsedData(null);
    setStreamedItems([]);
    setStreamStatus('');
  }, []);

  return {
    scanning,
    parsedData,
    streamedItems,
    streamStatus,
    scanReceipt,
    scanMultipleReceipts,
    uploadReceiptImage,
    clearParsedData
  };
};
