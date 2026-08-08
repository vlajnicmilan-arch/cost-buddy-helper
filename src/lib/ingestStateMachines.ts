/**
 * MAIL UVOZ — jedini izvor istine za dopuštene prijelaze stanja.
 *
 * Tri stroja: PORUKA (inbound_messages.status), PRIVITAK
 * (inbound_attachments.scan_status) i DOKUMENT (document_ingest_items.status).
 * Svaki prijelaz izvan tablice je programska greška i baca iznimku.
 */

export type MessageState =
  | 'primljena'
  | 'u_obradi'
  | 'zavrsena'
  | 'ceka_kvotu'
  | 'istekla'
  | 'zaustavljena_branom'
  | 'obrisana'
  | 'neuspjela'
  | 'neuspjela_konacno';

export type AttachmentState = 'ceka_sken' | 'siguran' | 'karantena';

export type DocumentState =
  | 'klasificiran'
  | 'izvucen'
  | 'na_pregledu'
  | 'potvrdjen'
  | 'povezan'
  | 'nije_za_nas'
  | 'odbaceno'
  | 'odbacio_korisnik';

export const MESSAGE_TRANSITIONS: Record<MessageState, readonly MessageState[]> = {
  primljena: ['u_obradi', 'ceka_kvotu', 'zaustavljena_branom'],
  ceka_kvotu: ['u_obradi', 'istekla'],
  zaustavljena_branom: ['u_obradi', 'obrisana'],
  u_obradi: ['zavrsena', 'neuspjela'],
  neuspjela: ['u_obradi', 'neuspjela_konacno'],
  zavrsena: [],
  istekla: [],
  obrisana: [],
  neuspjela_konacno: [],
};

export const ATTACHMENT_TRANSITIONS: Record<AttachmentState, readonly AttachmentState[]> = {
  ceka_sken: ['siguran', 'karantena'],
  siguran: [],
  karantena: [],
};

export const DOCUMENT_TRANSITIONS: Record<DocumentState, readonly DocumentState[]> = {
  klasificiran: ['izvucen', 'nije_za_nas', 'odbaceno'],
  izvucen: ['na_pregledu', 'nije_za_nas', 'odbaceno'],
  na_pregledu: ['potvrdjen', 'odbacio_korisnik', 'odbaceno'],
  potvrdjen: ['povezan'],
  povezan: [],
  nije_za_nas: [],
  odbaceno: [],
  odbacio_korisnik: [],
};

export const INITIAL_STATES = {
  message: 'primljena' as MessageState,
  attachment: 'ceka_sken' as AttachmentState,
  document: 'klasificiran' as DocumentState,
};

export class IngestTransitionError extends Error {
  constructor(machine: string, from: string, to: string) {
    super(`ingest_transition_denied: ${machine} ${from} -> ${to}`);
    this.name = 'IngestTransitionError';
  }
}

function check<S extends string>(
  machine: string,
  table: Record<S, readonly S[]>,
  from: S,
  to: S
): S {
  const allowed = table[from];
  if (!allowed || !allowed.includes(to)) {
    throw new IngestTransitionError(machine, from, to);
  }
  return to;
}

export function canTransitionMessage(from: MessageState, to: MessageState): boolean {
  return (MESSAGE_TRANSITIONS[from] ?? []).includes(to);
}
export function canTransitionAttachment(from: AttachmentState, to: AttachmentState): boolean {
  return (ATTACHMENT_TRANSITIONS[from] ?? []).includes(to);
}
export function canTransitionDocument(from: DocumentState, to: DocumentState): boolean {
  return (DOCUMENT_TRANSITIONS[from] ?? []).includes(to);
}

export function transitionMessage(from: MessageState, to: MessageState): MessageState {
  return check('poruka', MESSAGE_TRANSITIONS, from, to);
}
export function transitionAttachment(from: AttachmentState, to: AttachmentState): AttachmentState {
  return check('privitak', ATTACHMENT_TRANSITIONS, from, to);
}
export function transitionDocument(from: DocumentState, to: DocumentState): DocumentState {
  return check('dokument', DOCUMENT_TRANSITIONS, from, to);
}
