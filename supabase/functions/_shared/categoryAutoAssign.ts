/**
 * Serverski dio automatskog razvrstavanja (nalog 6).
 *
 * PREKIDAČ: funkcije koje rade BEZ klijenta (bank-sync-transactions …) koriste
 * nove ključeve i učenje SAMO kad je `SERVER_CATEGORY_TREE_ENABLED = true`.
 * Nalog 6b: UKLJUČENO nakon objave niza kategorija (nalozi 3–7b).
 * Isključuje se jednom izmjenom ove konstante (i ponovnom objavom funkcija).
 *
 * Funkcije koje zove klijent (categorize-transaction, parse-receipt) ne gledaju
 * prekidač nego oznaku verzije stabla u zahtjevu (`category_tree_version`).
 */
import {
  CATEGORY_TREE_VERSION,
  EXEMPT_CATEGORY_ID,
  buildAllowedCategoryLines,
  normalizeAssignedCategory,
  pickLearnedCategory,
  type AssignCustomCategory,
  type AssignDirection,
  type AssignedCategory,
  type LearnedCorrection,
} from './categoryAssign.ts';
import { CATEGORY_TREE_LABELS_HR } from './categoryTreeLabels.ts';

export const SERVER_CATEGORY_TREE_ENABLED = true;

/** Klijent je nova aplikacija i zna prikazati nove ključeve. */
export const clientWantsTree = (body: unknown): boolean =>
  !!body && typeof body === 'object' &&
  Number((body as Record<string, unknown>).category_tree_version) >= CATEGORY_TREE_VERSION;

export const treePromptLines = (
  customCategories: AssignCustomCategory[],
  direction: AssignDirection = 'expense',
) => buildAllowedCategoryLines(CATEGORY_TREE_LABELS_HR, { customCategories, direction });

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Korisnikove kategorije (bez izuzete) — id, naziv, skupina. */
export async function loadTreeCustomCategories(supabase: Supa, userId: string): Promise<AssignCustomCategory[]> {
  const { data } = await supabase
    .from('custom_categories')
    .select('id, name, group_key')
    .eq('user_id', userId);
  return ((data ?? []) as AssignCustomCategory[]).filter((c) => c.id !== EXEMPT_CATEGORY_ID);
}

/** SAMO korisnikovi, neponišteni ispravci (najnoviji prvi). */
export async function loadLearnedCorrections(supabase: Supa, userId: string): Promise<LearnedCorrection[]> {
  const { data } = await supabase
    .from('category_corrections')
    .select('user_id, corrected_category, merchant_name, description, created_at, reverted_at')
    .eq('user_id', userId)
    .is('reverted_at', null)
    .order('created_at', { ascending: false })
    .limit(1000);
  return (data ?? []) as LearnedCorrection[];
}

/**
 * Redoslijed: naučeni ispravak → AI (preko jedne provjere) → rezervni ključ.
 * Vraća samo kategoriju; movement_kind i tags se nikad ne postavljaju.
 */
export async function assignTreeCategory(input: {
  row: { merchant_name?: string | null; description?: string | null };
  userId: string;
  direction: AssignDirection;
  customCategories: AssignCustomCategory[];
  corrections: LearnedCorrection[];
  askAi?: () => Promise<string | null>;
  onUnknown?: (raw: string) => void;
  allowTransfer?: boolean;
}): Promise<AssignedCategory & { learned: boolean; fromAi: boolean }> {
  const learned = pickLearnedCategory(input.row, input.corrections, {
    userId: input.userId,
    customCategories: input.customCategories,
    direction: input.direction,
  });
  if (learned) return { ...learned, learned: true, fromAi: false };
  const raw = input.askAi ? await input.askAi() : null;
  const res = normalizeAssignedCategory(raw, {
    customCategories: input.customCategories,
    direction: input.direction,
    allowTransfer: input.allowTransfer,
  });
  if (res.unknown && raw) input.onUnknown?.(raw);
  return { ...res, learned: false, fromAi: !!raw && !res.unknown };
}

/** Nepoznat AI odgovor → app_diagnostics_logs (skraćen doslovni odgovor, bez osobnih podataka). */
export async function logUnknownAiCategory(fn: string, userId: string, raw: string): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/app_diagnostics_logs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        event: 'ai_category_unknown',
        user_id: userId,
        session_id: `edge-ai_category_unknown-${Date.now()}`,
        details: { function: fn, raw: String(raw).slice(0, 60) },
      }]),
    });
  } catch { /* ignore */ }
}
