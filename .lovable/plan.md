

# Popravak trend indikatora

## Problem
Trend badge prikazuje samo goli postotak (npr. `-100% ↓`) bez konteksta — korisnik ne zna na što se odnosi. Boje su već ispravne (linija 155: pad troškova = `text-income` = zeleno), ali nedostaje label.

## Promjene

### `src/components/home/SummarySection.tsx`
- Dodati `t('summary.vsLastMonth')` label ispod postotka u oba trend badgea (income i expense)
- Sakriti trend badge potpuno ako je postotak `-100%` (znači nema podataka za tekući mjesec — nije informativno)
- Struktura badgea:
```
+12% ↑
vs prošli mj.
```

### `src/i18n/locales/hr.json`
- Dodati u `summary` objekt: `"vsLastMonth": "vs prošli mj."`

### `src/i18n/locales/en.json`
- Dodati: `"vsLastMonth": "vs last month"`

### `src/i18n/locales/de.json`
- Dodati: `"vsLastMonth": "vs letzten Monat"`

## Detalj implementacije (linije 128-132 i 154-158)
Zamjenjujem svaki trend badge s:
```tsx
{incomeTrendPercent !== null && Math.abs(incomeTrendPercent) < 100 && (
  <div className="relative flex flex-col items-center">
    <span className={`text-[10px] sm:text-xs font-medium ${incomeTrendPercent >= 0 ? 'text-income' : 'text-destructive'}`}>
      {incomeTrendPercent >= 0 ? `+${incomeTrendPercent}%` : `${incomeTrendPercent}%`}
      {incomeTrendPercent >= 0 ? ' ↑' : ' ↓'}
    </span>
    <span className="text-[9px] text-muted-foreground">{t('summary.vsLastMonth')}</span>
  </div>
)}
```
Ista logika za expense (s invertiranim bojama koje su već ispravne).

