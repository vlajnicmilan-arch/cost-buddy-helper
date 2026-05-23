## Pravi uzrok

Iako `brandTableTheme` (`pdfBranding.ts`) ima `theme: 'plain'` bez `alternateRowStyles`, **6 poziva `brandAutoTable` šalje eksplicitni override** koji vraća zebra uzorak:

```ts
theme: 'striped',
headStyles: { fillColor: [35, 170, 145] },
```

Lokacije:
- `src/lib/projectReportExport.ts` linije 268, 293, 318, 346 (kategorije, faze, suradnici, radnici)
- `src/lib/reportExport.ts` linije 232, 398 (kategorije expense, kategorije income)

`'striped'` u jspdf-autotable automatski uključuje light-grey `alternateRowStyles` — točno ono što se vidi na screenshotu (str. 14–15 projektnog izvještaja).

## Što napraviti

### 1. Ukloniti `theme: 'striped'` i hardcoded header fill iz svih 6 poziva

Ostaviti `brandTableTheme` da naslijedi:
- bijeli header s muted uppercase labelima i teal donji border (0.5pt)
- hairline ispod svakog reda (#e2e8f0, 0.1pt)
- bez alternating background-a

Specifično — ukloniti ova dva ključa iz options:
```ts
theme: 'striped',                              // ← maknuti
headStyles: { fillColor: [35, 170, 145] },     // ← maknuti
```

Ako neka tablica i dalje treba prilagoditi `headStyles` (npr. `cellWidth`), zadržati taj key bez `fillColor`-a.

### 2. Spacing u feed layoutu + meta linija (iz prethodnog plana, A varijanta)

**`src/lib/printHtmlTemplate.ts`** (HTML feed):
- `.vmb-feed-item` padding `12px 0` → `6px 0`, gap `12px 16px` → `4px 14px`
- `.vmb-feed-day` margin `18px 0 8px` → `12px 0 4px`
- `.vmb-feed-meta` margin-top `3px` → `2px`
- `.vmb-feed-title` 13.5px → 12.5px, `.vmb-feed-amount` 14px → 13px

**`src/lib/reportExport.ts`** (PDF feed `drawTransactionFeed`):
- razmak između stavki `y += 10` → `y += 6.5`
- razmak između dana `y += 4` → `y += 2`
- day heading: label `y += 5` → `y += 4`, linija `y += 3` → `y += 2`
- meta y offset `y + 4` → `y + 3.2`

### 3. Merchant + izvor plaćanja u meta liniji (Wallet PDF)

U `generatePDFReport` i `generateIncomePDFReport` (`reportExport.ts`):
- `title` = `expense.description` (merchant kako ga korisnik upiše); fallback na `categoryInfo.name`
- `metaParts` = `[categoryInfo.name, paymentInfo.name, typeInfo.name (samo ako !== 'expense')]`

Importati `getPaymentSourceInfo` (već je u file-u). Za **custom:UUID** izvore `getPaymentSourceInfo` vraća generic label — ostaje kao A varijanta (bez prosljeđivanja `customPaymentSources` kroz `ReportData`).

## Što NE diram

- `PaymentSourceTransactionsDialog` — meta već ima kategoriju + tip + last4 kartice, izvor je u headeru. Profitira samo od stisnutijeg CSS-a.
- `projectFinancePdfExport.ts`, `invoicePdf.ts`, `estimatePdf.ts` — ne koriste striped override.
- Milestone progress (3C), CSV/JSON eksporti — nepromijenjeni.