export interface IncomingInvoiceOpenRequest {
  invoiceId: string;
  businessProfileId: string | null;
}

const KEY = 'eracun:open-invoice';
export const ERACUN_OPEN_INVOICE_EVENT = 'eracun:open-invoice';

let memoryRequest: IncomingInvoiceOpenRequest | null = null;

export const requestOpenIncomingInvoice = (request: IncomingInvoiceOpenRequest): void => {
  memoryRequest = request;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(request));
  } catch {
    /* private mode — memory fallback nosi zahtjev */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ERACUN_OPEN_INVOICE_EVENT));
  }
};

export const consumeOpenIncomingInvoiceRequest = (): IncomingInvoiceOpenRequest | null => {
  let stored: IncomingInvoiceOpenRequest | null = null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<IncomingInvoiceOpenRequest>;
      if (typeof parsed.invoiceId === 'string' && parsed.invoiceId.length > 0) {
        stored = {
          invoiceId: parsed.invoiceId,
          businessProfileId: typeof parsed.businessProfileId === 'string' ? parsed.businessProfileId : null,
        };
      }
      sessionStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
  const request = memoryRequest ?? stored;
  memoryRequest = null;
  return request;
};