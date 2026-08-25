/**
 * MAIL UVOZ — RAČUN I POTVRDA IZ ISTE PORUKE SU JEDNA OBVEZA.
 *
 * Kvar iz života (kolovoz 2026): Lovable je u jednoj poruci poslao dva
 * privitka za isti broj računa — „Invoice" i „Receipt". Korisnik je u redu
 * vidio DVA računa po 90 € i zaključio da je aplikacija pogriješila. Baza je
 * bila u pravu (`mail_item_confirm` drugu stavku veže na isti račun preko
 * `message_id`), ali to nitko nije REKAO unaprijed.
 *
 * Ovdje se ta veza prepoznaje PRIJE potvrde: ista poruka + isti broj dokumenta
 * = jedna obveza; jedna stavka je račun, druga potvrda plaćanja.
 */

export interface SiblingProbe {
  id: string;
  message_id: string | null;
  invoiceNumber: string | null;
  fileName: string | null;
  createdAt: string;
}

export type SiblingRole = 'invoice' | 'receipt';

export interface SiblingLink {
  /** Druga stavka iz iste poruke za isti broj dokumenta. */
  siblingId: string;
  role: SiblingRole;
  invoiceNumber: string;
}

/** Naziv datoteke koji odaje potvrdu plaćanja, a ne račun. */
const RECEIPT_HINT = /(receipt|potvrd|uplatnic|payment|zahvalnic|quittung)/i;

const normalizeNumber = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * Za svaku stavku vraća vezu na sestrinsku stavku iste obveze.
 * Grupe manje od dvije stavke i stavke bez broja dokumenta se preskaču.
 */
export function findSiblingDocuments(
  items: readonly SiblingProbe[],
): Map<string, SiblingLink> {
  const groups = new Map<string, SiblingProbe[]>();
  for (const item of items) {
    const number = normalizeNumber(item.invoiceNumber);
    if (!item.message_id || number === '') continue;
    const key = `${item.message_id}|${number}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const out = new Map<string, SiblingLink>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const hinted = group.filter((g) => RECEIPT_HINT.test(g.fileName ?? ''));
    // Točno jedan naziv odaje potvrdu → on je potvrda. Inače je potvrda ona
    // koja je stigla kasnije (račun prethodi potvrdi plaćanja).
    const receipt =
      hinted.length === 1
        ? hinted[0]
        : [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[group.length - 1];

    const invoice = group.find((g) => g.id !== receipt.id);
    if (!invoice) continue;

    const number = normalizeNumber(receipt.invoiceNumber);
    out.set(receipt.id, { siblingId: invoice.id, role: 'receipt', invoiceNumber: number });
    for (const other of group) {
      if (other.id === receipt.id) continue;
      out.set(other.id, { siblingId: receipt.id, role: 'invoice', invoiceNumber: number });
    }
  }
  return out;
}
