/**
 * BRIEF-VRATA — DOKAZIVA DESTINACIJA.
 *
 * Pravilo: poruka smije postojati samo ako odredište prikazuje TOČNO onaj skup
 * koji je brojan. Ovdje je popisano što koja destinacija stvarno prikazuje.
 *
 *  - uncertainty → `/dokumenti?tab=pending`: `MailReviewList` prikazuje
 *    `document_ingest_items` sa `status = 'na_pregledu'` — isti skup koji RPC
 *    broji. DOKAZIVO.
 *  - due → `/home?view=overdue`: Centar otvara eRačune s filtrom prekoračenih/
 *    dospjelih ulaznih računa. DOKAZIVO.
 *  - mail → RPC broji `document_ingest_items` sa `status = 'povezan'`
 *    (obrađeni dokumenti zadnjih 7 dana). Tab „Primljeno" NE prikazuje taj
 *    skup (prikazuje odbačene stavke i sirove mail poruke), a drugog ekrana
 *    za obrađene dokumente još nema. Dok takav tab ne postoji, poruka se NE
 *    prikazuje. Definicija brojanja se NE mijenja.
 */
import type { BriefCategoryId, BriefFilterTarget } from './types';

/** Destinacije koje dokazano prikazuju brojani skup, po kategoriji. */
const PROVABLE: Record<BriefCategoryId, (f: BriefFilterTarget) => boolean> = {
  uncertainty: (f) => f.path === '/dokumenti' && f.tab === 'pending',
  due: (f) => f.path === '/home',
  // Postoji tek kad ekran obrađenih dokumenata bude izgrađen.
  mail: (f) => f.path === '/dokumenti' && f.tab === 'processed',
};

export function isProvableTarget(
  category: BriefCategoryId,
  filter: BriefFilterTarget | null | undefined,
): boolean {
  if (!filter || !filter.path) return false;
  return PROVABLE[category](filter);
}
