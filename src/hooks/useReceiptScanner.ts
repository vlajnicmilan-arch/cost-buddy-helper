import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { Category, PaymentSource, ReceiptItem } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { LocalFileCache } from './useLocalFileCache';
import { LocalStorage } from './useLocalStorage';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { matchCustomByMethod } from '@/lib/paymentSourceMatching';

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

const UNREADABLE_RECEIPT_RE = /pročitati|procitati|analizirati|read|analyz/i;

type ReceiptHttpResult = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

const MAX_RECEIPT_IMAGE_WIDTH = 1400;
const RECEIPT_UPLOAD_TARGET_BYTES = 420_000;
const RECEIPT_UPLOAD_MAX_BYTES = 500_000;
const RECEIPT_FETCH_TIMEOUT_MS = 75_000;

const waitForImageLoad = (base64: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error('Failed to load image for receipt normalization');
      resolve(null);
    };
    img.src = base64;
  });
};

// Normalize receipt photos before upload. Android native HTTP and WebView fetch
// are both fragile with large base64 JSON bodies; keep OCR detail while making
// the request body predictably small enough to reach the backend.
const normalizeReceiptImage = async (base64: string): Promise<string> => {
  const img = await waitForImageLoad(base64);
  if (!img) return base64;

  let width = img.width;
  let height = img.height;

  if (width > MAX_RECEIPT_IMAGE_WIDTH) {
    height = Math.round((height * MAX_RECEIPT_IMAGE_WIDTH) / width);
    width = MAX_RECEIPT_IMAGE_WIDTH;
  }

  const render = (nextWidth: number, quality: number) => {
    const canvas = document.createElement('canvas');
    const nextHeight = Math.max(1, Math.round((height * nextWidth) / width));
    canvas.width = nextWidth;
    canvas.height = nextHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return base64;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, nextWidth, nextHeight);
    return canvas.toDataURL('image/jpeg', quality);
  };

  const attempts = [
    { width, quality: 0.82 },
    { width, quality: 0.74 },
    { width: Math.round(width * 0.9), quality: 0.74 },
    { width: Math.round(width * 0.82), quality: 0.72 },
  ];

  let best = base64;
  for (const attempt of attempts) {
    const normalized = render(Math.max(900, attempt.width), attempt.quality);
    best = normalized;
    if (normalized.length <= RECEIPT_UPLOAD_TARGET_BYTES) break;
  }

  return best.length <= RECEIPT_UPLOAD_MAX_BYTES || best.length < base64.length ? best : base64;
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('receipt_request_timeout');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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
    const totalBytes = imagesBase64.reduce((s, b) => s + (b?.length || 0), 0);
    try {
      logDiagnostic('receipt_scan_start', {
        pages: imagesBase64.length,
        total_base64_bytes: totalBytes,
        is_native: Capacitor.isNativePlatform(),
      });
    } catch {}

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        showError(t('errors.receipt.cloudRequired', 'AI skeniranje računa zahtijeva cloud način rada i prijavu. Možeš ručno unijeti podatke.'));
        return null;
      }

      const compressedImages = await Promise.all(
        imagesBase64.map(img => normalizeReceiptImage(img))
      );
      try {
        logDiagnostic('receipt_scan_images_normalized', {
          original_total_base64_bytes: totalBytes,
          normalized_total_base64_bytes: compressedImages.reduce((sum, img) => sum + img.length, 0),
          is_native: Capacitor.isNativePlatform(),
        });
      } catch {}

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

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`;
      const authHeader = `Bearer ${sessionData.session.access_token}`;

      const callViaFetch = async (payloadImages: string[]): Promise<ReceiptHttpResult> => {
        const payload = {
          imagesBase64: payloadImages,
          customPaymentSources: sourcesForApi,
          customCategories: customCategories || []
        };
        const webResponse = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify(payload)
        }, RECEIPT_FETCH_TIMEOUT_MS);
        return {
          ok: webResponse.ok,
          status: webResponse.status,
          json: () => webResponse.json(),
        };
      };

      const callParseReceipt = async (payloadImages: string[]): Promise<ReceiptHttpResult> => {
        try { logDiagnostic('receipt_scan_fetch_start', { image_count: payloadImages.length }); } catch {}
        try {
          const result = await callViaFetch(payloadImages);
          try { logDiagnostic('receipt_scan_fetch_done', { status: result.status }); } catch {}
          return result;
        } catch (fetchErr) {
          try {
            logDiagnostic({
              event: 'receipt_scan_fetch_failed',
              severity: 'error',
              details: { message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) },
            });
          } catch {}
          throw fetchErr;
        }
      };

      let response = await callParseReceipt(compressedImages);

      

      if (response.status === 429) {
        showError(t('errors.receipt.rateLimit', 'Previše zahtjeva. Pokušaj ponovno za minutu.'));
        return null;
      }

      if (response.status === 402) {
        showError(t('errors.receipt.noCredits', 'Nedostaje kredita za AI obradu.'));
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
        if (response.status === 400 && UNREADABLE_RECEIPT_RE.test(errorMessage)) {
          try {
            logDiagnostic('receipt_scan_retry_original_image', { reason: errorMessage });
          } catch {}
          response = await callParseReceipt(imagesBase64);
          if (response.ok) {
            try { logDiagnostic('receipt_scan_retry_success', { status: response.status }); } catch {}
          } else {
            try {
              const retryErrorData = await response.json();
              errorMessage = retryErrorData.error || errorMessage;
            } catch {}
          }
        }

        if (response.ok) {
          try { logDiagnostic('receipt_scan_response_received', { status: response.status }); } catch {}
        } else {
          try {
            logDiagnostic({
              event: 'receipt_scan_http_error',
              severity: 'error',
              details: { status: response.status, message: errorMessage },
            });
          } catch {}
          throw new Error(errorMessage);
        }
      }

      try {
        logDiagnostic('receipt_scan_response_received', { status: response.status });
      } catch {}
      const data = await response.json();
      
      // Map payment_method from AI to PaymentSource.
      // If user has a custom source whose name matches the standard method
      // (e.g. custom "Gotovina" while AI returned cash), prefer the custom one.
      let paymentSource: PaymentSource | null = null;
      let matchedCustomId: string | null = data.custom_payment_source_id || null;
      if (matchedCustomId) {
        paymentSource = `custom:${matchedCustomId}` as PaymentSource;
      } else if (data.payment_method === 'card' || data.payment_method === 'cash') {
        const method = data.payment_method as 'card' | 'cash';
        const customMatch = matchCustomByMethod(method, customPaymentSources || []);
        if (customMatch) {
          matchedCustomId = customMatch.id;
          paymentSource = `custom:${customMatch.id}` as PaymentSource;
        } else {
          paymentSource = method === 'card' ? 'bank' : 'cash';
        }
      }

      const merchantName = (typeof data.merchant === 'string' && data.merchant.trim().length > 0)
        ? data.merchant.trim()
        : ((typeof data.issuer_name === 'string' && data.issuer_name.trim().length > 0) ? data.issuer_name.trim() : '');

      const result: ParsedReceipt = {
        amount: data.amount,
        merchant: merchantName,
        description: (typeof data.description === 'string' && data.description.trim().length > 0)
          ? data.description.trim()
          : (merchantName || 'Račun'),
        category: data.category as Category,
        date: data.date || null,
        payment_source: paymentSource,
        custom_payment_source_id: matchedCustomId,
        payment_source_card_id: data.payment_source_card_id || null,
        is_installment: data.is_installment || false,
        installment_count: data.installment_count || null,
        installment_amount: data.installment_amount || null,
        transaction_type: data.transaction_type || 'expense',
        transfer_destination_name: data.transfer_destination_name || null,
        recipient_name: data.recipient_name || null,
        issuer_name: data.issuer_name || merchantName || null,
        issuer_oib: data.issuer_oib || null,
        items: (data.items || []).map((item: any) => ({
          name: item.name || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || undefined,
          total_price: item.total_price || 0
        }))
      };

      try {
        logDiagnostic('receipt_scan_preview_pre_render', {
          sources_count: customPaymentSources?.length ?? 0,
          matched_custom_source_id: result.custom_payment_source_id,
          payment_source: result.payment_source,
        });
      } catch {}
      setParsedData(result);
      
      // Show different message if custom source was matched
      if (matchedCustomId) {
        const matchedSource = customPaymentSources?.find(s => s.id === matchedCustomId);
        showSuccess(t('scanner.scanSuccessSource', { source: matchedSource?.name || t('scanner.customSource') }));
      } else {
        showSuccess(t('scanner.scanSuccessItems', { count: result.items.length }));
      }
      try {
        logDiagnostic('receipt_scan_success', {
          amount: result.amount,
          has_merchant: !!result.merchant,
          has_date: !!result.date,
          item_count: result.items.length,
        });
      } catch {}

      // Cache result locally only after the UI result is already returned.
      // On Android, Preferences/Filesystem can occasionally stall; that must never block preview.
      void (async () => {
        try {
          await LocalStorage.setJSON(`receipt_cache_${Date.now()}`, result);
          if (compressedImages[0]) {
            await LocalFileCache.saveReceiptImage(compressedImages[0]);
          }
          logDiagnostic('receipt_scan_cache_saved', {});
        } catch (cacheErr) {
          console.warn('Failed to cache receipt locally:', cacheErr);
          logDiagnostic({
            event: 'receipt_scan_cache_error',
            severity: 'warning',
            details: { message: cacheErr instanceof Error ? cacheErr.message : String(cacheErr) },
          });
        }
      })();
      return result;
    } catch (error) {
      if (isAbortLikeError(error)) {
        console.warn('Receipt scanning was interrupted:', error);
        try { logDiagnostic('receipt_scan_aborted', {}); } catch {}
        showError(t('errors.receipt.scanCancelled', 'Skeniranje je prekinuto. Pokušaj ponovno.'));
        return null;
      }

      if (error instanceof Error && error.message === 'receipt_request_timeout') {
        try { logDiagnostic('receipt_scan_request_timeout', { timeout_ms: RECEIPT_FETCH_TIMEOUT_MS }); } catch {}
        showError(t('errors.receipt.requestTimeout'));
        return null;
      }

      console.error('Error scanning receipt:', error);
      try {
        logDiagnostic({
          event: 'receipt_scan_exception',
          severity: 'error',
          details: { message: error instanceof Error ? error.message : String(error) },
        });
      } catch {}
      showError(t('errors.receipt.scanFailed', 'Greška pri skeniranju računa'));
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
