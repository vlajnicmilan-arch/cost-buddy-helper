/**
 * Klijentska validacija priloga odluke (Faza 3).
 * Mirror poslužiteljskih pravila (guard trigger na project_decision_attachments).
 */

export const MAX_ATTACHMENTS_PER_STEP = 3;
/** Dokumenti (PDF/DOCX/…): limit prije uploada — 5 MB. */
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

/** MIME-ovi koje smatramo slikama (pa idu kroz kompresiju). */
export const IMAGE_MIME_PREFIX = 'image/';
export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** MIME-ovi za dokumente koje šaljemo bez kompresije. */
export const SUPPORTED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export type AttachmentValidationError =
  | 'unsupportedType'
  | 'docTooLarge'
  | 'tooMany';

export interface AttachmentLike {
  type: string;
  name: string;
  size: number;
}

export const isImageAttachment = (f: Pick<AttachmentLike, 'type'>): boolean => {
  if (!f.type) return false;
  if (SUPPORTED_IMAGE_MIMES.has(f.type)) return true;
  return f.type.startsWith(IMAGE_MIME_PREFIX);
};

export const isDocAttachment = (f: Pick<AttachmentLike, 'type'>): boolean => {
  return SUPPORTED_DOC_MIMES.has(f.type);
};

export interface ValidationResult {
  ok: boolean;
  reason?: AttachmentValidationError;
}

/** Validira jedan file (tip + veličina). */
export const validateDecisionAttachment = (f: AttachmentLike): ValidationResult => {
  if (isImageAttachment(f)) return { ok: true };
  if (isDocAttachment(f)) {
    if (f.size > MAX_DOC_BYTES) return { ok: false, reason: 'docTooLarge' };
    return { ok: true };
  }
  return { ok: false, reason: 'unsupportedType' };
};

/** Može li se dodati još `incoming` priloga u korak koji već ima `current`? */
export const canAddMore = (currentCount: number, incoming: number): boolean =>
  currentCount + incoming <= MAX_ATTACHMENTS_PER_STEP;

/**
 * Predikat: smije li korak s ovom akcijom uopće nositi priloge?
 * Mirror server enforce trigger-a: accept/reject NE smiju imati priloge.
 */
export const stepActionAllowsAttachments = (action: string): boolean =>
  action === 'propose' || action === 'counter' || action === 'correction';
