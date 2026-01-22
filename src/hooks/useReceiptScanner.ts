import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category, ReceiptItem } from '@/types/expense';
import { toast } from 'sonner';

interface ParsedReceipt {
  amount: number;
  merchant: string;
  description: string;
  category: Category;
  date: string | null;
  items: ReceiptItem[];
}

export const useReceiptScanner = () => {
  const [scanning, setScanning] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);

  const scanReceipt = async (imageBase64: string): Promise<ParsedReceipt | null> => {
    setScanning(true);
    setParsedData(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        toast.error('Moraš biti prijavljen');
        return null;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({ imageBase64 })
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Greška pri skeniranju');
      }

      const data = await response.json();
      
      const result: ParsedReceipt = {
        amount: data.amount,
        merchant: data.merchant,
        description: data.description,
        category: data.category as Category,
        date: data.date || null,
        items: (data.items || []).map((item: any) => ({
          name: item.name || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || undefined,
          total_price: item.total_price || 0
        }))
      };

      setParsedData(result);
      toast.success(`Račun skeniran! Pronađeno ${result.items.length} artikala.`);
      return result;
    } catch (error) {
      console.error('Error scanning receipt:', error);
      toast.error(error instanceof Error ? error.message : 'Greška pri skeniranju računa');
      return null;
    } finally {
      setScanning(false);
    }
  };

  const uploadReceiptImage = async (imageBase64: string): Promise<string | null> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        return null;
      }

      const userId = sessionData.session.user.id;
      const fileName = `${userId}/${Date.now()}.jpg`;
      
      // Convert base64 to blob
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
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (error) {
        console.error('Error uploading receipt:', error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading receipt image:', error);
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
    uploadReceiptImage,
    clearParsedData
  };
};
