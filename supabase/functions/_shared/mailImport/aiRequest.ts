/**
 * MAIL UVOZ — sastavljanje AI zahtjeva.
 *
 * TVRDO PRAVILO CIJENE: AI dobiva TEKST (tijelo maila + tekstualni sloj PDF-a).
 * Multimodalni (file) blok — jedini skupi put — dopušten je ISKLJUČIVO za sken
 * bez tekstualnog sloja. PDF s tekstom → nula multimodalnih poziva (čuvar test).
 */

export interface AiRequestInput {
  subject?: string | null;
  fromHeader?: string | null;
  bodyText?: string | null;
  /** Tekstualni sloj PDF-a (prvih N stranica), prazno kod skena. */
  pdfText?: string | null;
  /** Base64 PDF-a — koristi se SAMO kad tekstualnog sloja nema. */
  pdfBase64?: string | null;
  pdfFilename?: string | null;
  /** Već poznata polja iz determinizma — AI ih ne treba ponovno tražiti. */
  knownFields?: Record<string, unknown>;
}

export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'file'; file: { filename: string; file_data: string } };

export const AI_JSON_TEMPLATE = [
  '{"classification":"racun|ponuda|nije_za_nas","confidence":"visoka|srednja|niska",',
  '"supplier_oib":null,"supplier_name":null,"recipient_oib":null,"recipient_name":null,',
  '"invoice_number":null,"issue_date":null,',
  '"due_date":null,"total_amount":null,"vat_amount":null,"currency":"EUR","iban":null}',
].join('');

export const MAX_AI_TEXT_CHARS = 20000;

export function buildAiPrompt(input: AiRequestInput): string {
  const known = Object.entries(input.knownFields ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`);

  const text = [(input.bodyText ?? '').trim(), (input.pdfText ?? '').trim()]
    .filter((part) => part.length > 0)
    .join('\n\n--- PDF ---\n\n')
    .slice(0, MAX_AI_TEXT_CHARS);

  return [
    'Klasificiraj dokument iz e-pošte. Vrati ISKLJUČIVO JSON:',
    AI_JSON_TEMPLATE,
    'Polje koje ne možeš pouzdano pročitati postavi na null. NIKAD ne vraćaj prazan string.',
    'Datume vraćaj ISKLJUČIVO u obliku YYYY-MM-DD (nikad 28.02.2026.).',
    'supplier_* je IZDAVATELJ dokumenta, recipient_* je KUPAC (obveznik/platitelj/primatelj) — nikad ih ne zamijeni.',

    known.length > 0 ? `Već provjereno (ne mijenjaj): ${known.join(', ')}` : '',
    '',
    `Predmet: ${input.subject ?? ''}`,
    `Pošiljatelj: ${input.fromHeader ?? ''}`,
    'Tekst:',
    text,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export interface AiRequestPlan {
  content: AiContentBlock[];
  /** `true` samo za sken bez tekstualnog sloja. */
  multimodal: boolean;
}

export function buildAiRequest(input: AiRequestInput): AiRequestPlan {
  const pdfText = (input.pdfText ?? '').trim();
  const content: AiContentBlock[] = [{ type: 'text', text: buildAiPrompt(input) }];

  // Multimodalno SAMO kad PDF nema tekstualni sloj (sken).
  const multimodal = pdfText.length === 0 && !!input.pdfBase64;
  if (multimodal) {
    content.push({
      type: 'file',
      file: {
        filename: input.pdfFilename ?? 'dokument.pdf',
        file_data: `data:application/pdf;base64,${input.pdfBase64}`,
      },
    });
  }

  return { content, multimodal };
}
