import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import hr from '@/i18n/locales/hr.json';
import {
  normalizeAssignedCategory,
  pickLearnedCategory,
  buildAllowedCategoryLines,
  FALLBACK_CATEGORY,
  EXEMPT_CATEGORY_ID,
  type LearnedCorrection,
} from '@/lib/categoryAssign';
import { CATEGORY_LEAVES } from '@/lib/categoryTree';
import { CATEGORY_TREE_LABELS_HR } from '../../supabase/functions/_shared/categoryTreeLabels';
import { buildEditCorrection } from '@/lib/categoryCorrectionLog';

const START = '// ---------------- SHARED CORE START ----------------';
const END = '// ---------------- SHARED CORE END ----------------';
const core = (p: string) => {
  const s = readFileSync(join(process.cwd(), p), 'utf8');
  return s.slice(s.indexOf(START), s.indexOf(END) + END.length);
};

const customs = [
  { id: 'c-1', name: 'Kućni ljubimci', group_key: 'other' },
  { id: EXEMPT_CATEGORY_ID, name: 'Pokrivanje drugih pizdarija', group_key: null },
];
const leafKeys = new Set(CATEGORY_LEAVES.map((l) => l.key));
const UID = 'u-1';
const corr = (o: Partial<LearnedCorrection>): LearnedCorrection => ({
  user_id: UID, corrected_category: 'fuel', merchant_name: 'INA Split', description: null,
  created_at: '2026-09-01T00:00:00Z', reverted_at: null, ...o,
});

describe('categoryAssign — jedna provjera', () => {
  it('zrcalo klijent ↔ _shared je identično', () => {
    expect(core('supabase/functions/_shared/categoryAssign.ts')).toBe(core('src/lib/categoryAssign.ts'));
  });

  it('izlaz je uvijek iz dopuštenog skupa (list, korisnička, široki stari ključ ili rezervni)', () => {
    const inputs = ['fuel', 'food', 'car', 'beauty', 'nonsense', '', null, 'Kućni ljubimci', 'c-1', 'transfer', EXEMPT_CATEGORY_ID, '"coffee".'];
    for (const i of inputs) {
      const r = normalizeAssignedCategory(i, { customCategories: customs });
      const ok = leafKeys.has(r.category) || r.category === 'c-1' || r.source === 'alias_unsorted' || r.category === FALLBACK_CATEGORY;
      expect(ok).toBe(true);
      expect(r.category).not.toBe(EXEMPT_CATEGORY_ID);
    }
  });

  it('stari ključ se mapira na list', () => {
    expect(normalizeAssignedCategory('beauty')).toMatchObject({ category: 'care', source: 'alias_leaf' });
    expect(normalizeAssignedCategory('sports').category).toBe('hobbies');
  });

  it('široki stari ključ → skupina + nerazvrstano, nikad tihi list', () => {
    const r = normalizeAssignedCategory('transport');
    expect(r).toMatchObject({ category: 'transport', source: 'alias_unsorted', unknown: false });
    expect(leafKeys.has(r.category)).toBe(false);
  });

  it('nepoznato → rezervni ključ + oznaka za dijagnostiku; prijenos samo kad je dopušten', () => {
    expect(normalizeAssignedCategory('xyz')).toEqual({ category: 'other', source: 'fallback', unknown: true });
    expect(normalizeAssignedCategory('transfer').unknown).toBe(true);
    expect(normalizeAssignedCategory('transfer', { allowTransfer: true }).category).toBe('transfer');
  });

  it('korisnička kategorija po nazivu → id; izuzeta se nikad ne dodjeljuje', () => {
    expect(normalizeAssignedCategory('kucni ljubimci', { customCategories: customs }).category).toBe('c-1');
    expect(normalizeAssignedCategory(EXEMPT_CATEGORY_ID, { customCategories: customs }).unknown).toBe(true);
  });

  it('smjer: prihod ne dobiva list troška', () => {
    expect(normalizeAssignedCategory('fuel', { direction: 'income' }).unknown).toBe(true);
    expect(normalizeAssignedCategory('salary', { direction: 'income' }).category).toBe('salary');
  });

  it('izlaz nosi samo kategoriju — nikad movement_kind ni tags', () => {
    const r = normalizeAssignedCategory('fuel');
    expect(Object.keys(r).sort()).toEqual(['category', 'source', 'unknown']);
  });
});

describe('categoryAssign — učenje iz ispravaka', () => {
  it('korisnikov ispravak pobjeđuje (najnoviji za isti ključ trgovca)', () => {
    const r = pickLearnedCategory({ merchant_name: 'INA  SPLIT 1234' }, [
      corr({ corrected_category: 'car_service', created_at: '2026-08-01T00:00:00Z' }),
      corr({ corrected_category: 'fuel', created_at: '2026-09-01T00:00:00Z' }),
    ], { userId: UID });
    expect(r?.category).toBe('fuel');
  });

  it('poništeni ispravak se ne koristi', () => {
    expect(pickLearnedCategory({ merchant_name: 'INA Split' }, [corr({ reverted_at: '2026-09-02T00:00:00Z' })], { userId: UID })).toBeNull();
  });

  it('tuđi ispravci se nikad ne koriste', () => {
    expect(pickLearnedCategory({ merchant_name: 'INA Split' }, [corr({ user_id: 'drugi' })], { userId: UID })).toBeNull();
  });

  it('ispravak na izuzetu kategoriju se ne primjenjuje', () => {
    expect(pickLearnedCategory({ merchant_name: 'INA Split' }, [corr({ corrected_category: EXEMPT_CATEGORY_ID })], { userId: UID, customCategories: customs })).toBeNull();
  });
});

describe('categoryAssign — popis za AI', () => {
  it('generiran iz registra: svi listovi troška + korisničke, bez izuzete i bez prihoda', () => {
    const { keys, lines } = buildAllowedCategoryLines(CATEGORY_TREE_LABELS_HR, { customCategories: customs });
    const expenseLeaves = CATEGORY_LEAVES.filter((l) => l.group !== 'income').map((l) => l.key);
    expect(keys).toEqual([...expenseLeaves, 'c-1']);
    expect(lines).toContain('- fuel → Gorivo (skupina: Auto)');
    expect(lines).not.toContain(EXEMPT_CATEGORY_ID);
    expect(lines).not.toContain('salary');
  });

  it('serverski nazivi su identični hr.json', () => {
    const t = (hr as any).categoryTree;
    expect(CATEGORY_TREE_LABELS_HR.leaves).toEqual(t.leaves);
    const { mine, ...groups } = t.groups;
    expect(CATEGORY_TREE_LABELS_HR.groups).toEqual(groups);
    expect(CATEGORY_TREE_LABELS_HR.mine).toBe(mine);
  });
});

describe('ispravak u uređivanju → category_corrections', () => {
  const old = { id: 'e1', category: 'food', category_origin: 'ai_suggested', merchant_name: 'Bistro', tags: ['luxury'], movement_kind: null };
  it('promjena kategorije osobnog zapisa gradi redak oblika naloga 5', () => {
    const row = buildEditCorrection(old, { ...old, category: 'restaurants' }, UID);
    expect(row).toMatchObject({
      user_id: UID, expense_id: 'e1', original_category: 'food', corrected_category: 'restaurants',
      original_origin: 'ai_suggested', original_tags: ['luxury'], corrected_tags: ['luxury'],
      original_movement_kind: null, corrected_movement_kind: null,
    });
  });
  it('bez promjene, prijenos, poslovni/projektni zapis ili izuzeta → ništa', () => {
    expect(buildEditCorrection(old, old, UID)).toBeNull();
    expect(buildEditCorrection(old, { ...old, category: 'transfer', type: 'transfer' }, UID)).toBeNull();
    expect(buildEditCorrection({ ...old, business_profile_id: 'b' }, { ...old, category: 'coffee' }, UID)).toBeNull();
    expect(buildEditCorrection({ ...old, project_id: 'p' }, { ...old, category: 'coffee' }, UID)).toBeNull();
    expect(buildEditCorrection(old, { ...old, category: EXEMPT_CATEGORY_ID }, UID)).toBeNull();
  });
});

describe('objava — stari klijent i isključen prekidač', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  it('prekidač je zadano isključen', () => {
    expect(read('supabase/functions/_shared/categoryAutoAssign.ts')).toMatch(/export const SERVER_CATEGORY_TREE_ENABLED = false;/);
  });
  it('stari put u funkcijama ostaje (stari popis ključeva i validacija)', () => {
    const cat = read('supabase/functions/categorize-transaction/index.ts');
    expect(cat).toContain('clientWantsTree(body) && !hasRestricted');
    expect(cat).toContain('const category = rawCategory && allCategories.includes(rawCategory) ? rawCategory : null;');
    const bank = read('supabase/functions/bank-sync-transactions/index.ts');
    expect(bank).toContain('SERVER_CATEGORY_TREE_ENABLED ? await loadTreeCustomCategories');
    expect(bank).toContain('const aiCat = await categorizeViaAI(description);');
    expect(read('supabase/functions/parse-receipt/index.ts')).toContain('const useTree = clientWantsTree(body) && !restrictedCategories;');
  });
  it('automatika nigdje ne piše movement_kind ni tags', () => {
    for (const f of ['categorize-transaction', 'parse-receipt', 'bank-sync-transactions']) {
      const s = read(`supabase/functions/${f}/index.ts`);
      expect(s).not.toMatch(/movement_kind\s*:/);
      expect(s).not.toMatch(/\btags\s*:/);
    }
  });
});

describe('merchantKey: opći bankovni izrazi (7b)', () => {
  it('„Kartično plaćanje 1234 KONZUM" uči po „konzum"', () => {
    expect(merchantKey({ description: 'Kartično plaćanje 1234 KONZUM' })).toBe('konzum');
  });
  it('sam opći izraz ili kratki ključ → prazno (nema učenja)', () => {
    for (const d of ['Kartično plaćanje', 'PLAĆANJE KARTICOM 5555', 'Uplata', 'Terećenje', 'POS', 'VISA', 'Trajni nalog', 'ab']) {
      expect(merchantKey({ description: d })).toBe('');
    }
    expect(merchantKey({ merchant_name: 'Mastercard' })).toBe('');
  });
  it('ispravak s općim opisom se ne prenosi', () => {
    const c = corr({ merchant_name: null, description: 'Kartično plaćanje', corrected_category: 'coffee' });
    expect(pickLearnedCategory({ description: 'Kartično plaćanje' }, [c], { userId: UID, customCategories: customs })).toBeNull();
  });
});

