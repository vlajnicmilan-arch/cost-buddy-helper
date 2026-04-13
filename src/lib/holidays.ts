/**
 * Public holidays helper — generates holidays client-side per year and locale.
 * Supports: hr (Croatia), en (UK), de (Germany).
 */

function computeEaster(year: number): Date {
  // Gauss / Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fixed(year: number, month: number, day: number): string {
  return dateKey(new Date(year, month - 1, day));
}

function getCroatianHolidays(year: number): Map<string, string> {
  const easter = computeEaster(year);
  const easterMon = addDays(easter, 1);
  const corpusChristi = addDays(easter, 60);

  const holidays = new Map<string, string>();
  holidays.set(fixed(year, 1, 1), 'Nova godina');
  holidays.set(fixed(year, 1, 6), 'Bogojavljenje');
  holidays.set(dateKey(easter), 'Uskrs');
  holidays.set(dateKey(easterMon), 'Uskrsni ponedjeljak');
  holidays.set(fixed(year, 5, 1), 'Praznik rada');
  holidays.set(fixed(year, 5, 30), 'Dan državnosti');
  holidays.set(dateKey(corpusChristi), 'Tijelovo');
  holidays.set(fixed(year, 6, 22), 'Dan antifašističke borbe');
  holidays.set(fixed(year, 8, 5), 'Dan pobjede');
  holidays.set(fixed(year, 8, 15), 'Velika Gospa');
  holidays.set(fixed(year, 11, 1), 'Svi sveti');
  holidays.set(fixed(year, 11, 18), 'Dan sjećanja');
  holidays.set(fixed(year, 12, 25), 'Božić');
  holidays.set(fixed(year, 12, 26), 'Sveti Stjepan');
  return holidays;
}

function getUKHolidays(year: number): Map<string, string> {
  const easter = computeEaster(year);
  const goodFriday = addDays(easter, -2);
  const easterMon = addDays(easter, 1);

  // Early May bank holiday: first Monday of May
  const earlyMay = firstMonday(year, 5);
  // Spring bank holiday: last Monday of May
  const springBH = lastMonday(year, 5);
  // Summer bank holiday: last Monday of August
  const summerBH = lastMonday(year, 8);

  const holidays = new Map<string, string>();
  holidays.set(fixed(year, 1, 1), "New Year's Day");
  holidays.set(dateKey(goodFriday), 'Good Friday');
  holidays.set(dateKey(easterMon), 'Easter Monday');
  holidays.set(dateKey(earlyMay), 'Early May Bank Holiday');
  holidays.set(dateKey(springBH), 'Spring Bank Holiday');
  holidays.set(dateKey(summerBH), 'Summer Bank Holiday');
  holidays.set(fixed(year, 12, 25), 'Christmas Day');
  holidays.set(fixed(year, 12, 26), 'Boxing Day');
  return holidays;
}

function getGermanHolidays(year: number): Map<string, string> {
  const easter = computeEaster(year);
  const goodFriday = addDays(easter, -2);
  const easterMon = addDays(easter, 1);
  const ascension = addDays(easter, 39);
  const whitMon = addDays(easter, 50);

  const holidays = new Map<string, string>();
  holidays.set(fixed(year, 1, 1), 'Neujahr');
  holidays.set(dateKey(goodFriday), 'Karfreitag');
  holidays.set(dateKey(easterMon), 'Ostermontag');
  holidays.set(fixed(year, 5, 1), 'Tag der Arbeit');
  holidays.set(dateKey(ascension), 'Christi Himmelfahrt');
  holidays.set(dateKey(whitMon), 'Pfingstmontag');
  holidays.set(fixed(year, 10, 3), 'Tag der Deutschen Einheit');
  holidays.set(fixed(year, 12, 25), '1. Weihnachtstag');
  holidays.set(fixed(year, 12, 26), '2. Weihnachtstag');
  return holidays;
}

function firstMonday(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

function lastMonday(year: number, month: number): Date {
  const d = new Date(year, month, 0); // last day of month
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Returns a Map of dateKey → holiday name for the given year and language.
 */
export function getHolidays(year: number, lang: string): Map<string, string> {
  const l = lang.toLowerCase().slice(0, 2);
  switch (l) {
    case 'hr': return getCroatianHolidays(year);
    case 'de': return getGermanHolidays(year);
    case 'en': return getUKHolidays(year);
    default: return getCroatianHolidays(year);
  }
}
