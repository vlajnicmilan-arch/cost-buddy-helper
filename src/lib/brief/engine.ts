/**
 * BRIEF-VRATA V1 — deterministicki motor. NULA AI.
 *
 * Ulaz: snimka cinjenica (RPC) + zapis o zadnjem prikazu (localStorage).
 * Izlaz: 1 do 3 poruke, fiksnim prioritetom, svaka s dokazivom destinacijom.
 *
 * Zeljezna pravila:
 *  - MIRNO je fallback: postoji li ijedna poruka iz kategorija, MIRNO ne postoji.
 *  - Nikad izmisljena poruka: kategorija bez sadrzaja se ne prikazuje.
 *  - Watermark ima prednost pred brojem pri odredivanju NEW.
 *  - Nema dokazive destinacije (filter) => nema poruke.
 */
import {
  BRIEF_CATEGORY_PRIORITY,
  BRIEF_MAX_MESSAGES,
  type BriefCategoryFacts,
  type BriefCategoryId,
  type BriefCategoryState,
  type BriefContinuity,
  type BriefContinuityEntry,
  type BriefMessage,
  type BriefSnapshot,
} from './types';
import { isProvableTarget } from './destinations';

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Je li `a` strogo noviji od `b`. Nepoznato = nije noviji. */
export function isNewerWatermark(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = time(a);
  if (ta === null) return false;
  const tb = time(b);
  if (tb === null) return true;
  return ta > tb;
}

export function deriveCategoryState(
  prev: BriefContinuityEntry | undefined,
  facts: BriefCategoryFacts,
): BriefCategoryState {
  if (facts.count <= 0) return 'resolved';
  if (!prev) return 'new';
  if (isNewerWatermark(facts.watermark, prev.watermark)) return 'new';
  if (facts.count < prev.count) return 'reminder';
  return 'unchanged';
}

interface BuildInput {
  snapshot: BriefSnapshot | null;
  continuity: BriefContinuity;
}

function messageForCategory(
  id: BriefCategoryId,
  facts: BriefCategoryFacts,
  state: BriefCategoryState,
  prev: BriefContinuityEntry | undefined,
): BriefMessage | null {
  // Dokaziva destinacija je uvjet postojanja poruke: odrediste mora prikazati
  // TOCNO brojani skup (vidi ./destinations.ts).
  if (!isProvableTarget(id, facts.filter)) return null;

  // RESOLVED ima smisla samo ako je prethodno stvarno nesto stajalo.
  if (state === 'resolved' && !(prev && prev.count > 0)) return null;

  if (id === 'mail') {
    // Obraden dokument je po prirodi novost — ne ponavlja se.
    if (state !== 'new') return null;
    return {
      category: 'mail',
      state,
      textKey: 'briefGate.mail.new',
      textParams: { count: facts.count },
      actionKey: 'briefGate.mail.action',
      target: facts.filter,
    };
  }

  if (id === 'uncertainty') {
    const textKey =
      state === 'new'
        ? 'briefGate.uncertainty.new'
        : state === 'resolved'
          ? 'briefGate.uncertainty.resolved'
          : 'briefGate.uncertainty.pending';
    return {
      category: 'uncertainty',
      state,
      textKey,
      textParams: { count: facts.count },
      actionKey: 'briefGate.uncertainty.action',
      target: facts.filter,
    };
  }

  // DOSPIJECE
  const single = facts.count === 1 && !!facts.issuer;
  const textKey =
    state === 'resolved'
      ? 'briefGate.due.resolved'
      : state === 'new'
        ? single
          ? 'briefGate.due.newOne'
          : 'briefGate.due.newMany'
        : single
          ? 'briefGate.due.pendingOne'
          : 'briefGate.due.pendingMany';
  return {
    category: 'due',
    state,
    textKey,
    textParams: { count: facts.count, issuer: facts.issuer ?? undefined, dueDate: facts.nextDue ?? null },
    actionKey: 'briefGate.due.action',
    target: facts.filter,
  };
}

export function buildBriefMessages({ snapshot, continuity }: BuildInput): BriefMessage[] {
  const messages: BriefMessage[] = [];
  const categories = snapshot?.categories ?? {};

  for (const id of BRIEF_CATEGORY_PRIORITY) {
    const facts = categories[id];
    if (!facts) continue; // djelomicna snimka: tiho izostavi
    const prev = continuity[id];
    const state = deriveCategoryState(prev, facts);
    const msg = messageForCategory(id, facts, state, prev);
    if (msg) messages.push(msg);
    if (messages.length >= BRIEF_MAX_MESSAGES) break;
  }

  if (messages.length > 0) return messages;

  const hadPrevious = Object.keys(continuity).length > 0;
  return [
    {
      category: 'calm',
      state: 'calm',
      textKey: hadPrevious ? 'briefGate.calm.sincePrevious' : 'briefGate.calm.firstToday',
      textParams: {},
      actionKey: 'briefGate.calm.action',
      target: null,
    },
  ];
}

/** Zapis stanja cinjenica — nastaje TEK kad su vrata stvarno prikazana. */
export function continuityFromSnapshot(snapshot: BriefSnapshot | null, now: Date): BriefContinuity {
  const next: BriefContinuity = {};
  const categories = snapshot?.categories ?? {};
  for (const id of BRIEF_CATEGORY_PRIORITY) {
    const facts = categories[id];
    if (!facts) continue;
    next[id] = { count: facts.count, watermark: facts.watermark ?? null, shownAt: now.toISOString() };
  }
  return next;
}

/**
 * Spajanje, ne zamjena: kategorije kojih u snimci NEMA zadrzavaju stari zapis,
 * inace bi se sljedeci put pojavile kao 'new' iako ih je korisnik vec vidio.
 */
export function mergeContinuity(prev: BriefContinuity, next: BriefContinuity): BriefContinuity {
  return { ...prev, ...next };
}
