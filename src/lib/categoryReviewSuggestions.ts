/**
 * „Pregled kategorija" — prijedlozi bez AI-ja. Čista logika, bez prikaza.
 *
 * Izvori prijedloga: (a) aliasi iz registra, (b) pravila po trgovcu/opisu,
 * (c) korisnikova vlastita povijest, (d) vrste kretanja novca za „Ostalo".
 * Ništa se ne mijenja bez korisnikove potvrde (RPC category_review_apply).
 * Prijedlog smije dirati SAMO category, movement_kind i tags.
 */
import { CATEGORY_GROUPS, LEGACY_ALIASES, resolveTreeCategory } from '@/lib/categoryTree';
import { isExpenseType, isIncomeType } from '@/lib/spendClassification';

/** „Pokrivanje drugih pizdarija" — izuzeta iz svega, po ID-u. */
export const REVIEW_EXEMPT_CATEGORY_ID = 'ab61e917-645c-465c-94f4-aec2645062e9';

export type ReviewMovementKind =
  | 'own_transfer' | 'atm' | 'loan_given' | 'loan_repaid_to_me'
  | 'loan_received' | 'loan_repaid_by_me' | 'own_company_payment';
export type ReviewTag = 'unnecessary' | 'luxury';
export type ReviewConfidence = 'high' | 'medium' | 'low';
export type ReviewReason =
  | 'history' | 'history_siblings' | 'rule' | 'alias' | 'own_transfer' | 'atm'
  | 'loan' | 'loan_person' | 'worker' | 'own_company' | 'tag_category'
  | 'type_change' | 'broken_value' | 'no_match';
export type ReviewSection = 'suggestion' | 'unmatched' | 'needs_decision' | 'broken';

export interface ReviewRow {
  id: string;
  type: string;
  amount: number;
  date?: string | null;
  category: string | null;
  description?: string | null;
  merchant_name?: string | null;
  movement_kind?: string | null;
  tags?: string[] | null;
  expense_nature?: string | null;
  deleted_at?: string | null;
}

export interface ReviewCorrection {
  merchant_name?: string | null;
  description?: string | null;
  corrected_category: string;
  corrected_movement_kind?: string | null;
  reverted_at?: string | null;
  created_at: string;
}

export interface ReviewContext {
  customCategories: { id: string; name: string }[];
  corrections?: ReviewCorrection[];
  /** Imena vlastitih novčanika (Aircash, Revolut, Keks…). */
  ownSourceNames?: string[];
  /** Korisnikovo ime/prezime (za „sam sebi"). */
  selfNames?: string[];
  /** Imena vlastitih firmi (poslovni profili). */
  ownCompanyNames?: string[];
  /** Imena radnika iz „Ljudi" („Ime Prezime"). */
  workerNames?: string[];
}

export interface ReviewProposal {
  category?: string;
  movement_kind?: ReviewMovementKind;
  tags?: ReviewTag[];
}

export interface ReviewGroup {
  key: string;
  section: ReviewSection;
  reason: ReviewReason;
  confidence: ReviewConfidence;
  /** Prikazni naziv trgovca/opisa. */
  label: string;
  /** Trenutna vrijednost category (zajednička svim recima grupe). */
  currentCategory: string;
  proposal: ReviewProposal | null;
  /** Kandidati listova iz registra (alias široke kategorije). */
  candidateLeaves: string[];
  rows: ReviewRow[];
  total: number;
}

export interface CategoryReviewResult {
  suggestions: ReviewGroup[];
  unmatched: ReviewGroup[];
  needsDecision: ReviewGroup[];
  broken: ReviewGroup[];
  /** Broj zapisa s prijedlogom (kartica „N zapisa čeka razvrstavanje"). */
  pendingCount: number;
}

// ---------------------------------------------------------------------------
// Normalizacija
// ---------------------------------------------------------------------------
export const normalizeText = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

/** Ključ trgovca: bez broja kartice, brojeva i repa iza „ - " / zareza; prve 3 riječi. */
export const merchantKey = (row: { merchant_name?: string | null; description?: string | null }): string => {
  const base = normalizeText(row.merchant_name || row.description);
  const head = base.split(/ - |,/)[0] ?? '';
  const cleaned = head
    .replace(/\*+/g, ' ')
    .replace(/\d[\dx]*/g, ' ')
    .replace(/[^a-z&.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 3).join(' ');
};

const rowText = (row: ReviewRow): string =>
  ` ${normalizeText(`${row.merchant_name ?? ''} ${row.description ?? ''}`)} `;

// ---------------------------------------------------------------------------
// (b) Pravila po trgovcu/opisu → list iz dogovorenog stabla
// ---------------------------------------------------------------------------
interface LeafRule { leaf: string; re: RegExp; income?: boolean }

export const LEAF_RULES: LeafRule[] = [
  { leaf: 'delivery', re: /\b(wolt|glovo|bolt food|pauza\.hr)\b/ },
  { leaf: 'coffee', re: /\b(caffe|cafe|kafic|kava|coffee|espresso)\b/ },
  { leaf: 'restaurants', re: /\b(restoran|restaurant|pizzeri\w*|konoba|bistro|grill|mcdonald\w*|burger|sushi)\b/ },
  { leaf: 'marenda', re: /\b(pekar\w*|bakery|marenda|burek)\b/ },
  { leaf: 'groceries', re: /\b(konzum|lidl|kaufland|spar|interspar|plodine|tommy|studenac|eurospin|ribola|ktc|metro cash)\b/ },
  { leaf: 'fuel', re: /\b(ina|petrol|tifon|crodux|lukoil|shell|omv|benzinsk\w*)\b/ },
  { leaf: 'car_service', re: /\b(autoservis|servis vozila|vulkaniz\w*|autopraon\w*|car wash)\b/ },
  { leaf: 'car_parts', re: /\b(autodijelovi|auto dijelovi|auto kuca)\b/ },
  { leaf: 'tolls_parking', re: /\b(hac|autocest\w*|parking|bina istra|arz|enc)\b/ },
  { leaf: 'car_registration', re: /\b(tehnicki pregled|registracij\w*|cvh)\b/ },
  { leaf: 'ferry', re: /\b(jadrolinij\w*|krilo|trajekt\w*)\b/ },
  { leaf: 'taxi', re: /\b(uber|bolt|taxi|cammeo)\b/ },
  { leaf: 'lodging', re: /\b(airbnb|booking\.com|hotel|hostel)\b/ },
  { leaf: 'rent', re: /\b(najam|stanarin\w*|najamnin\w*)\b/ },
  { leaf: 'utilities', re: /\b(hep|vodovod|plinara|a1 hrvatska|hrvatski telekom|telemach|iskon|odvoz smeca|cistoca|komunal\w*)\b/ },
  { leaf: 'bank_fees', re: /\b(naknada|provizij\w*|odrzavanj\w* racuna|kamat\w*)\b/ },
  { leaf: 'taxes', re: /\b(porez\w*|porezna uprava|javni biljeznik|biljeznik|hzzo|doprinos\w*)\b/ },
  { leaf: 'subscriptions', re: /\b(netflix|spotify|hbo|youtube|google one|icloud|apple\.com|lovable|anthropic|openai|chatgpt)\b/ },
  { leaf: 'material', re: /\b(pevex|bauhaus|mikic|elipso|obi|bauk\w*)\b/ },
  { leaf: 'health', re: /\b(ljekarn\w*|pharm\w*|poliklinik\w*|dom zdravlja)\b/ },
  { leaf: 'clothing', re: /\b(zara|reserved|deichmann|ccc|pull&bear|bershka|c&a|h&m)\b/ },
  { leaf: 'care', re: /\b(frizer\w*|kozmet\w*|dm|muller|bipa)\b/ },
  { leaf: 'hobbies', re: /\b(cinestar|kino|teretan\w*|fitnes\w*|gym)\b/ },
  { leaf: 'salary', re: /\b(placa|salary|isplata place)\b/, income: true },
  { leaf: 'refunds', re: /\b(povrat|refund)\b/, income: true },
];

export const matchLeafRule = (row: ReviewRow): string | null => {
  const text = rowText(row);
  const isIncome = isIncomeType(row);
  for (const r of LEAF_RULES) {
    if (!!r.income !== isIncome) continue;
    if (r.re.test(text)) return r.leaf;
  }
  return null;
};

// ---------------------------------------------------------------------------
// (d) Vrste kretanja novca
// ---------------------------------------------------------------------------
const ATM_RE = /\b(atm|bankomat|isplata gotovine|podizanje gotovine)\b/;
const OWN_TRANSFER_RE = /\b(sam sebi|samom sebi|vlastiti racun|prijenos na vlastit\w*|interni prijenos)\b/;
const LOAN_RE = /\b(pozajm\w*|posudb\w*|zajam)\b/;
const WORKER_RE = /\b(isplata radnik\w*|dnevnic\w*|nadnic\w*)\b/;

const containsName = (text: string, names: string[] | undefined, minLen = 4): boolean =>
  (names ?? []).some((n) => {
    const nn = normalizeText(n);
    return nn.length >= minLen && text.includes(` ${nn}`);
  });

interface MovementHit { proposal: ReviewProposal; reason: ReviewReason; confidence: ReviewConfidence }

const matchMovement = (row: ReviewRow, ctx: ReviewContext, loanPersons: Set<string>): MovementHit | null => {
  const text = rowText(row);
  const isExpense = isExpenseType(row);
  if (isExpense && ATM_RE.test(text)) {
    return { proposal: { movement_kind: 'atm' }, reason: 'atm', confidence: 'high' };
  }
  if (OWN_TRANSFER_RE.test(text)) {
    return { proposal: { movement_kind: 'own_transfer' }, reason: 'own_transfer', confidence: 'high' };
  }
  if (containsName(text, ctx.ownCompanyNames)) {
    return { proposal: { movement_kind: 'own_company_payment' }, reason: 'own_company', confidence: 'medium' };
  }
  if (LOAN_RE.test(text)) {
    return {
      proposal: { movement_kind: isExpense ? 'loan_given' : 'loan_received' },
      reason: 'loan', confidence: 'medium',
    };
  }
  const mk = merchantKey(row);
  if (mk && loanPersons.has(mk)) {
    return {
      proposal: { movement_kind: isExpense ? 'loan_given' : 'loan_received' },
      reason: 'loan_person', confidence: 'low',
    };
  }
  if (isExpense && (WORKER_RE.test(text) || containsName(text, ctx.workerNames, 6))) {
    return { proposal: { category: 'workers' }, reason: 'worker', confidence: 'medium' };
  }
  if (containsName(text, ctx.selfNames, 6) || containsName(text, ctx.ownSourceNames)) {
    return { proposal: { movement_kind: 'own_transfer' }, reason: 'own_transfer', confidence: 'medium' };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Glavna funkcija
// ---------------------------------------------------------------------------
const TAG_CATEGORY_NAMES: Record<string, ReviewTag> = { nepotrebno: 'unnecessary', luksuz: 'luxury' };

/** Listovi skupine prikladni za smjer zapisa. */
const candidateLeavesFor = (groupKey: string | null, type: string): string[] => {
  if (!groupKey) return [];
  if (type === 'income') return CATEGORY_GROUPS.find((g) => g.key === 'income')?.leaves ?? [];
  return CATEGORY_GROUPS.find((g) => g.key === groupKey)?.leaves ?? [];
};

const isValidTarget = (value: string, ctx: ReviewContext): boolean =>
  value !== REVIEW_EXEMPT_CATEGORY_ID &&
  (CATEGORY_GROUPS.some((g) => g.leaves.includes(value)) || ctx.customCategories.some((c) => c.id === value));

export const buildCategoryReview = (rows: ReviewRow[], ctx: ReviewContext): CategoryReviewResult => {
  const customById = new Map(ctx.customCategories.map((c) => [c.id, c]));
  const tree = ctx.customCategories.map((c) => ({ id: c.id, name: c.name }));

  const live = rows.filter(
    (r) =>
      r.deleted_at == null &&
      r.movement_kind == null &&
      r.category !== REVIEW_EXEMPT_CATEGORY_ID &&
      r.expense_nature !== 'correction' &&
      r.expense_nature !== 'krug_settlement',
  );

  // (c) povijest: ispravci (najnoviji po trgovcu) + već razvrstani zapisi istog trgovca.
  const historyByMerchant = new Map<string, ReviewCorrection>();
  [...(ctx.corrections ?? [])]
    .filter((c) => !c.reverted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((c) => {
      const k = merchantKey(c);
      if (k) historyByMerchant.set(k, c);
    });

  const siblingVotes = new Map<string, Map<string, number>>();
  const loanPersons = new Set<string>();
  for (const r of live) {
    const k = merchantKey(r);
    if (!k) continue;
    if (LOAN_RE.test(rowText(r))) loanPersons.add(k);
    const cat = r.category ?? '';
    const res = resolveTreeCategory(cat, tree);
    const custom = customById.get(cat);
    const settled =
      (res.leafKey && !res.unsorted) ||
      (custom && !TAG_CATEGORY_NAMES[normalizeText(custom.name)]);
    if (!settled || !isValidTarget(cat, ctx)) continue;
    const m = siblingVotes.get(k) ?? new Map<string, number>();
    m.set(cat, (m.get(cat) ?? 0) + 1);
    siblingVotes.set(k, m);
  }
  // Osobe s pozajmicom: ključ bez riječi „pozajmica".
  for (const k of [...loanPersons]) {
    const person = k.replace(LOAN_RE, '').trim();
    if (person) loanPersons.add(person);
  }

  const groups = new Map<string, ReviewGroup>();
  const push = (
    section: ReviewSection, reason: ReviewReason, confidence: ReviewConfidence,
    proposal: ReviewProposal | null, row: ReviewRow, candidateLeaves: string[] = [],
  ) => {
    const mk = merchantKey(row);
    const sig = proposal ? JSON.stringify(proposal) : '';
    const key = `${section}|${reason}|${sig}|${row.category ?? ''}|${row.type}|${mk}`;
    const g = groups.get(key) ?? {
      key, section, reason, confidence, label: row.merchant_name || row.description || mk || '—',
      currentCategory: row.category ?? '', proposal, candidateLeaves, rows: [], total: 0,
    };
    g.rows.push(row);
    g.total += Math.abs(Number(row.amount) || 0);
    groups.set(key, g);
  };

  for (const r of live) {
    const cat = r.category ?? '';
    const res = resolveTreeCategory(cat, tree);
    const custom = customById.get(cat);

    // 5) Promjena bi tražila promjenu type → samo lista „treba tvoju odluku".
    if (r.type === 'transfer') {
      if (cat && cat !== 'other' && !res.isTransfer) push('needs_decision', 'type_change', 'low', null, r);
      continue;
    }

    // 4) Korisničke „Nepotrebno"/„Luksuz": oznaka + prava kategorija (ako je pravilo nađe).
    if (custom) {
      const tag = TAG_CATEGORY_NAMES[normalizeText(custom.name)];
      if (!tag) continue;
      const tags = Array.from(new Set([...(r.tags ?? []), tag])) as ReviewTag[];
      const leaf = matchLeafRule(r);
      push('suggestion', 'tag_category', leaf ? 'medium' : 'low', leaf ? { tags, category: leaf } : { tags }, r);
      continue;
    }

    // Pokvarene vrijednosti („0", „8", prazno, custom_income_* bez kategorije): bez prijedloga.
    if (res.invalid) {
      push('broken', 'broken_value', 'low', null, r);
      continue;
    }

    // Već određen list → nema pregleda.
    if (res.leafKey && !res.unsorted) continue;
    if (res.isTransfer) continue;

    const mk = merchantKey(r);
    const hist = mk ? historyByMerchant.get(mk) : undefined;
    if (hist && isValidTarget(hist.corrected_category, ctx) && hist.corrected_category !== cat) {
      const p: ReviewProposal = { category: hist.corrected_category };
      if (hist.corrected_movement_kind) p.movement_kind = hist.corrected_movement_kind as ReviewMovementKind;
      push('suggestion', 'history', 'high', p, r);
      continue;
    }

    const mv = matchMovement(r, ctx, loanPersons);
    if (mv) {
      push('suggestion', mv.reason, mv.confidence, mv.proposal, r);
      continue;
    }

    const votes = mk ? siblingVotes.get(mk) : undefined;
    if (votes && votes.size) {
      const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
      if (best && best[0] !== cat) {
        push('suggestion', 'history_siblings', 'medium', { category: best[0] }, r);
        continue;
      }
    }

    const alias = LEGACY_ALIASES[cat];
    const aliasGroup = alias && alias.kind !== 'transfer' ? alias.group : res.groupKey;
    const candidates = candidateLeavesFor(aliasGroup, r.type);

    const leaf = matchLeafRule(r);
    if (leaf) {
      const conf: ReviewConfidence = candidates.includes(leaf) ? 'high' : 'medium';
      push('suggestion', 'rule', conf, { category: leaf }, r);
      continue;
    }

    if (candidates.length === 1 && aliasGroup !== 'other') {
      push('suggestion', 'alias', 'low', { category: candidates[0] }, r, candidates);
      continue;
    }

    push('unmatched', 'no_match', 'low', null, r, candidates);
  }

  const byTotal = (a: ReviewGroup, b: ReviewGroup) => b.total - a.total;
  const all = [...groups.values()];
  const suggestions = all.filter((g) => g.section === 'suggestion').sort(byTotal);
  return {
    suggestions,
    unmatched: all.filter((g) => g.section === 'unmatched').sort(byTotal),
    needsDecision: all.filter((g) => g.section === 'needs_decision').sort(byTotal),
    broken: all.filter((g) => g.section === 'broken').sort(byTotal),
    pendingCount: suggestions.reduce((n, g) => n + g.rows.length, 0),
  };
};

/** Stavke za RPC: samo category / movement_kind / tags. */
export const toApplyItems = (rows: { id: string }[], proposal: ReviewProposal) =>
  rows.map((r) => ({
    expense_id: r.id,
    ...(proposal.category !== undefined ? { category: proposal.category } : {}),
    ...(proposal.movement_kind !== undefined ? { movement_kind: proposal.movement_kind } : {}),
    ...(proposal.tags !== undefined ? { tags: proposal.tags } : {}),
  }));

// ---------------------------------------------------------------------------
// Greške RPC-a
// ---------------------------------------------------------------------------
const KNOWN_ERRORS = [
  'not_authenticated', 'not_allowed', 'expense_not_found', 'exempt_category',
  'invalid_category', 'invalid_tags', 'too_many_items', 'no_items',
] as const;
export type CategoryReviewErrorCode = (typeof KNOWN_ERRORS)[number] | 'invalid_value' | 'unknown';

export const resolveCategoryReviewErrorCode = (
  err: { code?: string | null; message?: string | null } | null | undefined,
): CategoryReviewErrorCode => {
  const msg = String(err?.message ?? '');
  const hit = KNOWN_ERRORS.find((k) => msg === k || msg.includes(k));
  if (hit) return hit;
  if (err?.code === '23514') return 'invalid_value';
  return 'unknown';
};

export const categoryReviewErrorKey = (code: CategoryReviewErrorCode): string =>
  `categoryReview.errors.${code}`;
