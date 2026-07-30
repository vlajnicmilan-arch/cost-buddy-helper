import { describe, it, expect } from 'vitest';
import {
  computeReportTotals,
  buildCategoryTotalsById,
  aggregateCategoryTotalsByName,
  formatPercent,
  isCorrectionTx,
  buildMetaParts,
  stripActionPrefix,
  computeTransferSplit,
} from '@/lib/reportTotals';

const tx = (over: Partial<any> = {}) => ({
  type: 'expense',
  amount: 100,
  category: 'other',
  expense_nature: null,
  income_source_id: null,
  ...over,
});

describe('reportTotals', () => {
  it('korekcija (type income) se ne broji u prihode', () => {
    const t = computeReportTotals([
      tx({ type: 'income', amount: 763.32, expense_nature: 'correction' }),
      tx({ type: 'income', amount: 320.38 }),
    ]);
    expect(t.income).toBe(320.38);
  });

  it('korekcija (type expense) se ne broji u troškove', () => {
    const t = computeReportTotals([
      tx({ amount: 84.93, expense_nature: 'correction' }),
      tx({ amount: 15.07 }),
    ]);
    expect(t.expenses).toBe(15.07);
  });

  it('ulazni transfer ide u transfers, ne u income', () => {
    const t = computeReportTotals([
      tx({ type: 'transfer', amount: 100, income_source_id: 'src-1' }),
    ]);
    expect(t.income).toBe(0);
    expect(t.transfers).toBe(100);
  });

  it('regularni prihod/trošak normalno + neto', () => {
    const t = computeReportTotals([
      tx({ type: 'income', amount: 500 }),
      tx({ type: 'expense', amount: 200 }),
    ]);
    expect(t).toMatchObject({ income: 500, expenses: 200, balance: 300, transfers: 0 });
  });

  it('byCategory izostavlja korekcije i ne-troškove', () => {
    const by = buildCategoryTotalsById([
      tx({ amount: 50, category: 'food' }),
      tx({ amount: 84.93, category: 'food', expense_nature: 'correction' }),
      tx({ type: 'income', amount: 10, category: 'food' }),
    ]);
    expect(by).toEqual({ food: 50 });
  });

  it('kategorije agregirane po imenu (2 ID-a → 1 redak)', () => {
    const rows = aggregateCategoryTotalsByName(
      { a: 10, b: 5, c: 30 },
      (id) => (id === 'c' ? 'Hrana' : 'Ostalo'),
    );
    expect(rows).toEqual([
      { name: 'Hrana', amount: 30 },
      { name: 'Ostalo', amount: 15 },
    ]);
  });

  it('postotak u hrvatskom formatu sa zarezom', () => {
    expect(formatPercent(82.1, 100, 'hr-HR')).toBe('82,1%');
    expect(formatPercent(1, 0, 'hr-HR')).toBe('0,0%');
  });

  it('isCorrectionTx detektira korekciju', () => {
    expect(isCorrectionTx({ expense_nature: 'correction' })).toBe(true);
    expect(isCorrectionTx({ expense_nature: 'regular' })).toBe(false);
  });
});

// ===== Dashboard / executive summary layer =====
import {
  topCategoriesWithRest,
  cleanFeedTitle,
  buildFeedSubtitle,
  buildExecutiveSummary,
  findLargestExpense,
} from '@/lib/reportTotals';

const fmt = {
  currency: (n: number) => `${n.toFixed(2)} EUR`,
  date: (d: Date) => d.toLocaleDateString('hr-HR'),
  percent: (v: number, t: number) => formatPercent(v, t, 'hr-HR'),
};

const tplHr = {
  main: 'U razdoblju od {{start}} do {{end}} zabilježeno je {{count}} transakcija: {{income}} prihoda i {{expenses}} troškova (neto {{net}}).',
  categoriesTwo: 'Najviše je otišlo na {{cat1}} ({{pct1}}), zatim {{cat2}} ({{pct2}}).',
  categoriesOne: 'Najviše je otišlo na {{cat1}} ({{pct1}}).',
  largest: 'Najveći pojedinačni trošak: {{title}}, {{amount}} ({{date}}).',
  empty: 'U odabranom razdoblju nema transakcija.',
};

describe('report dashboard helpers', () => {
  it('top 5 + ostale agregacija', () => {
    const rows = [10, 9, 8, 7, 6, 5, 4].map((a, i) => ({ name: `K${i}`, amount: a }));
    const out = topCategoriesWithRest(rows, 5, 'Ostale kategorije');
    expect(out).toHaveLength(6);
    expect(out[5]).toEqual({ name: 'Ostale kategorije', amount: 9 });
  });

  it('ne dodaje ostale kad ih nema', () => {
    const rows = [{ name: 'A', amount: 5 }];
    expect(topCategoriesWithRest(rows, 5, 'Ostale')).toEqual(rows);
  });

  it('dvoredni trgovac: podnaslov samo kad se razlikuje (nakon čišćenja obje strane)', () => {
    const raw = 'WOLT ZAGREB, 3dd09f2b-c6bc-4603-b819-a392f1234567';
    const clean = cleanFeedTitle(raw);
    expect(clean).toBe('Wolt Zagreb');
    // UUID rep se briše s obje strane → nema dodatne informacije → nema podnaslova
    expect(buildFeedSubtitle(raw, clean)).toBe('');
    expect(buildFeedSubtitle('WOLT ZAGREB, Trg bana Jelacica 1', clean)).toContain('Jelacica');
    expect(buildFeedSubtitle('Kava', 'Kava')).toBe('');
  });

  it('podnaslov nikad ne sadrži broj kartice', () => {
    const raw = 'LIDL, Kartica: 416598******1542';
    const clean = cleanFeedTitle(raw);
    const sub = buildFeedSubtitle(raw, clean);
    expect(sub).not.toContain('416598');
  });

  it('summary šablona s tipičnim podacima', () => {
    const s = buildExecutiveSummary(
      {
        start: new Date(2026, 6, 1),
        end: new Date(2026, 6, 31),
        count: 12,
        income: 1000,
        expenses: 800,
        net: 200,
        categories: [{ name: 'Hrana', amount: 400 }, { name: 'Prijevoz', amount: 200 }],
        largestExpense: { title: 'Konzum', amount: 150, date: new Date(2026, 6, 10) },
      },
      fmt,
      tplHr,
    );
    expect(s).toHaveLength(3);
    expect(s[0]).toContain('12 transakcija');
    expect(s[0]).toContain('1000.00 EUR prihoda');
    expect(s[1]).toBe('Najviše je otišlo na Hrana (50,0%), zatim Prijevoz (25,0%).');
    expect(s[2]).toContain('Konzum, 150.00 EUR');
  });

  it('edge: prazno razdoblje daje urednu poruku', () => {
    const s = buildExecutiveSummary(
      { start: new Date(), end: new Date(), count: 0, income: 0, expenses: 0, net: 0, categories: [] },
      fmt,
      tplHr,
    );
    expect(s).toEqual([tplHr.empty]);
  });

  it('edge: 1 transakcija, 0 troškova — nema NaN', () => {
    const s = buildExecutiveSummary(
      {
        start: new Date(2026, 0, 1),
        end: new Date(2026, 0, 1),
        count: 1,
        income: 50,
        expenses: 0,
        net: 50,
        categories: [],
        largestExpense: null,
      },
      fmt,
      tplHr,
    );
    expect(s).toHaveLength(1);
    expect(s.join(' ')).not.toContain('NaN');
  });

  it('edge: jedna kategorija koristi jednočlanu šablonu', () => {
    const s = buildExecutiveSummary(
      {
        start: new Date(2026, 0, 1), end: new Date(2026, 0, 31), count: 1,
        income: 0, expenses: 100, net: -100,
        categories: [{ name: 'Ostalo', amount: 100 }],
      },
      fmt,
      tplHr,
    );
    expect(s[1]).toBe('Najviše je otišlo na Ostalo (100,0%).');
  });

  it('findLargestExpense preskače korekcije i prihode', () => {
    const l = findLargestExpense([
      tx({ amount: 20 }),
      tx({ amount: 900, expense_nature: 'correction' }),
      tx({ type: 'income', amount: 999 }),
      tx({ amount: 60 }),
    ] as any);
    expect(l?.amount).toBe(60);
  });
});

// ===== Merchant extraction (real DB samples) + period presets =====
import { parseKeksPay, aggregateMerchants } from '@/lib/reportTotals';
import { resolvePeriodRange, isWithinPeriod } from '@/lib/periodPresets';

describe('merchant extraction', () => {
  it('maskirana kartica na početku + UUID rep → title-case naziv', () => {
    const raw = '462765XXXXXX7262, AIRCASH.EU ZAGREB, c6838442-9d1e-4881-8c01-a2e70b7f33d3';
    expect(cleanFeedTitle(raw)).toBe('Aircash.eu Zagreb');
    expect(buildFeedSubtitle(raw, cleanFeedTitle(raw))).not.toContain('462765');
  });

  it('KEKS Pay: druga strana · svrha (vlasnik izvješća izbačen)', () => {
    const raw = 'KEKS Pay - Vinka P šalje Milan V za "Kava" - 326633655, 08d7fdb9-1111-2222-3333-444455556666';
    expect(cleanFeedTitle(raw, 'Milan V')).toBe('Vinka P · Kava');
    expect(parseKeksPay(raw, 'Vinka P')?.title).toBe('Milan V · Kava');
  });

  it('emoji shortcode se uklanja', () => {
    const raw = 'KEKS Pay - Vinka P šalje Milan V za "Šaljem :moneybag:" - 326633655';
    expect(cleanFeedTitle(raw, 'Milan V')).toBe('Vinka P · Šaljem');
  });

  it('ručni unos ostaje nepromijenjen', () => {
    expect(cleanFeedTitle('Kava s Ivanom')).toBe('Kava s Ivanom');
    expect(buildFeedSubtitle('Kava s Ivanom', 'Kava s Ivanom')).toBe('');
  });

  it('aggregateMerchants sumira po imenu, sortirano', () => {
    const rows = aggregateMerchants([
      { title: 'Konzum', amount: 10 },
      { title: 'konzum', amount: 5 },
      { title: 'Lidl', amount: 20 },
      { title: '', amount: 99 },
    ]);
    expect(rows).toEqual([
      { name: 'Lidl', amount: 20 },
      { name: 'Konzum', amount: 15 },
    ]);
  });
});

describe('interpretive merchant insert', () => {
  const tpl = {
    ...tplHr,
    categoriesOne: 'Najviše je otišlo na {{cat1}} ({{pct1}}{{ins}}).',
    merchantsInsertTwo: ' — prvenstveno {{m1}} i {{m2}}',
    merchantsInsertOne: ' — prvenstveno {{m1}}',
  };
  const base = {
    start: new Date(2026, 6, 1), end: new Date(2026, 6, 31), count: 5,
    income: 0, expenses: 300, net: -300,
    categories: [{ name: 'Hrana', amount: 300 }],
  };

  it('dva trgovca', () => {
    const s = buildExecutiveSummary(
      { ...base, topCategoryMerchants: [{ name: 'Lidl', amount: 200 }, { name: 'Konzum', amount: 100 }] },
      fmt, tpl,
    );
    expect(s.join(' ')).toContain('— prvenstveno Lidl i Konzum)');
  });

  it('jedan trgovac → jednočlana varijanta', () => {
    const s = buildExecutiveSummary(
      { ...base, topCategoryMerchants: [{ name: 'Lidl', amount: 200 }] }, fmt, tpl,
    );
    expect(s.join(' ')).toContain('— prvenstveno Lidl)');
  });

  it('bez trgovaca → umetak se preskače', () => {
    const s = buildExecutiveSummary({ ...base, topCategoryMerchants: [] }, fmt, tpl);
    expect(s.join(' ')).not.toContain('prvenstveno');
  });
});


describe('periodPresets', () => {
  const now = new Date(2026, 7, 15);

  it('this-month granice', () => {
    const r = resolvePeriodRange('this-month', { now });
    expect(r.start).toEqual(new Date(2026, 7, 1));
    expect(r.end).toEqual(new Date(2026, 7, 15));
  });

  it('last-month granice', () => {
    const r = resolvePeriodRange('last-month', { now });
    expect(r.start).toEqual(new Date(2026, 6, 1));
    expect(r.end).toEqual(new Date(2026, 6, 31));
  });

  it('custom raspon', () => {
    const r = resolvePeriodRange('custom', { customStart: '2026-01-05', customEnd: '2026-02-10' });
    expect(isWithinPeriod(new Date(2026, 0, 5), r)).toBe(true);
    expect(isWithinPeriod(new Date(2026, 1, 11), r)).toBe(false);
  });

  it('all koristi najraniji datum', () => {
    const r = resolvePeriodRange('all', { now, dates: [new Date(2024, 2, 3), new Date(2025, 0, 1)] });
    expect(r.start).toEqual(new Date(2024, 2, 3));
  });
});

describe('sažetak — spojena rečenica, meta i prijenosi', () => {
  const f = {
    currency: (n: number) => `${n.toFixed(2)} €`,
    date: (d: Date) => d.toISOString().slice(0, 10),
    percent: (v: number, t: number) => `${Math.round((v / t) * 100)}%`,
  };
  const tpl = {
    main: 'Main.',
    categoriesTwo: 'Najviše je otišlo na {{cat1}} ({{pct1}}{{ins}}), zatim {{cat2}} ({{pct2}}).',
    categoriesOne: 'Najviše je otišlo na {{cat1}} ({{pct1}}{{ins}}).',
    merchantsInsertTwo: ' — prvenstveno {{m1}} i {{m2}}',
    merchantsInsertOne: ' — prvenstveno {{m1}}',
    largest: 'Najveći pojedinačni trošak: {{title}} {{amount}} {{date}}.',
    empty: 'Nema.',
  };
  const base = {
    start: new Date('2026-01-01'), end: new Date('2026-01-31'), count: 5,
    income: 0, expenses: 1000, net: -1000,
    categories: [{ name: 'Računi', amount: 600 }, { name: 'Hrana', amount: 200 }],
  };

  it('dva trgovca — umetak unutar rečenice kategorija, bez zasebne rečenice', () => {
    const s = buildExecutiveSummary({ ...base, topCategoryMerchants: [
      { name: 'Telemach', amount: 400 }, { name: 'HEP', amount: 200 },
    ] }, f, tpl);
    expect(s[1]).toBe('Najviše je otišlo na Računi (60% — prvenstveno Telemach i HEP), zatim Hrana (20%).');
    expect(s.filter(x => x.includes('Računi')).length).toBe(1);
  });

  it('jedan trgovac — bez "i m2"', () => {
    const s = buildExecutiveSummary({ ...base, topCategoryMerchants: [{ name: 'Telemach', amount: 400 }] }, f, tpl);
    expect(s[1]).toContain('— prvenstveno Telemach)');
  });

  it('bez trgovaca — rečenica bez umetka', () => {
    const s = buildExecutiveSummary({ ...base, topCategoryMerchants: [] }, f, tpl);
    expect(s[1]).toBe('Najviše je otišlo na Računi (60%), zatim Hrana (20%).');
  });

  it('nema duple točke kod "d.o.o." i prefiks se skida', () => {
    const s = buildExecutiveSummary({ ...base, topCategoryMerchants: [
      { name: 'Placanje racuna - Telemach Hrvatska d.o.o.', amount: 400 },
    ] }, f, tpl);
    expect(s[1]).toContain('prvenstveno Telemach Hrvatska d.o.o)');
    expect(s[1]).not.toContain('d.o.o..');
  });

  it('preskače najveći trošak kada je isti trgovac kao m1', () => {
    const s = buildExecutiveSummary({
      ...base,
      topCategoryMerchants: [{ name: 'Telemach Hrvatska d.o.o.', amount: 400 }],
      largestExpense: { title: 'Placanje racuna - Telemach Hrvatska d.o.o.', amount: 400, date: new Date('2026-01-10') },
    }, f, tpl);
    expect(s.some(x => x.startsWith('Najveći'))).toBe(false);
  });

  it('zadržava najveći trošak kada je drugi trgovac', () => {
    const s = buildExecutiveSummary({
      ...base,
      topCategoryMerchants: [{ name: 'Telemach', amount: 400 }],
      largestExpense: { title: 'Placanje racuna - HEP', amount: 300, date: new Date('2026-01-10') },
    }, f, tpl);
    expect(s[2]).toContain('Najveći pojedinačni trošak: HEP');
  });

  it('meta red: dedupe + "Ostalo" skriven → transfer daje samo "Prijenos"', () => {
    expect(buildMetaParts(['Prijenos', 'Ostalo', 'Prijenos'], ['Ostalo'])).toEqual(['Prijenos']);
  });

  it('meta red: korekcija samo "Korekcija"', () => {
    expect(buildMetaParts(['Korekcija'], ['Ostalo'])).toEqual(['Korekcija']);
  });

  it('meta red: zadržava stvarne segmente', () => {
    expect(buildMetaParts(['Hrana', 'Aircash', 'Ostalo'], ['Ostalo'])).toEqual(['Hrana', 'Aircash']);
  });

  it('kapitalizacija naslova: aircash.eu → Aircash.eu', () => {
    expect(cleanFeedTitle('aircash.eu')).toBe('Aircash.eu');
  });

  it('stripActionPrefix uzima zadnji segment', () => {
    expect(stripActionPrefix('Placanje racuna - Telemach Hrvatska d.o.o.')).toBe('Telemach Hrvatska d.o.o.');
    expect(stripActionPrefix('Telemach')).toBe('Telemach');
  });

  it('prijenosi razrez: oba smjera', () => {
    const s = computeTransferSplit([
      tx({ type: 'transfer', amount: 100, income_source_id: 'acc' }),
      tx({ type: 'transfer', amount: 40, income_source_id: 'other' }),
      tx({ type: 'expense', amount: 10 }),
    ], 'acc');
    expect(s).toEqual({ inbound: 100, outbound: 40 });
  });

  it('prijenosi razrez: samo izlazni / nula', () => {
    expect(computeTransferSplit([tx({ type: 'transfer', amount: 40, income_source_id: 'other' })], 'acc'))
      .toEqual({ inbound: 0, outbound: 40 });
    expect(computeTransferSplit([tx({ type: 'expense', amount: 40 })], 'acc'))
      .toEqual({ inbound: 0, outbound: 0 });
  });
});
