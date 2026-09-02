export interface FreeTransactionLimitPeriod {
  month: string;
  resetDate: string;
}

function localeForLanguage(language: string): string {
  if (language.startsWith('en')) return 'en-US';
  if (language.startsWith('de')) return 'de-DE';
  return 'hr-HR';
}

export function getFreeTransactionLimitPeriod(
  language: string,
  now = new Date(),
): FreeTransactionLimitPeriod {
  const locale = localeForLanguage(language);
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    month: monthFormatter.format(currentMonth),
    resetDate: dateFormatter.format(nextMonth),
  };
}
