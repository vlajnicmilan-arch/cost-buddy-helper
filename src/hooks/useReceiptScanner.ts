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

// Kompresija slike za mobilne uređaje - smanjuje veličinu za stabilnije slanje
const compressImage = async (base64: string, maxWidth = 1200, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Smanjuj ako je preveliko
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
      console.log('Image compressed from', base64.length, 'to', compressed.length);
      resolve(compressed);
    };
    img.onerror = () => {
      console.error('Failed to load image for compression');
      resolve(base64); // Vrati original ako kompresija ne uspije
    };
    img.src = base64;
  });
};

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

      // Komprimiraj sliku za stabilniji prijenos s mobitela
      console.log('Compressing image...');
      const compressedImage = await compressImage(imageBase64);
      console.log('Image ready, sending to API...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({ imageBase64: compressedImage })
        }
      );

      console.log('Response status:', response.status);

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
        } catch {
          console.error('Failed to parse error response');
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Parsed data:', data);
      
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

      // Create signed URL for private bucket (valid for 1 hour)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('receipts')
        .createSignedUrl(fileName, 3600);

      if (urlError || !urlData?.signedUrl) {
        console.error('Error creating signed URL:', urlError);
        return null;
      }

      return urlData.signedUrl;
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
