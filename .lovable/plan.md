
# Dijagnoza dva TypeError-a — SAMO nalazi, bez izmjena

## Ograničenje istrage

Nemam pristup Sentryju iz sandboxa. Bez stack tracea, source-mape ili route/komponenta labela ne mogu s **sigurnošću** pokazati liniju koja je izbacila `z.slice`. Umjesto pogađanja pojedine linije, dolje su svi realni kandidati koje sam pronašao statičkim pregledom danas dirnutih datoteka (git diff za 2 dana), plus što je isključeno.

**Molim Milana da doda iz Sentryja:** (a) top frame stack tracea sa source-mape (unminificirani file:line), (b) breadcrumbs zadnje 2–3 akcije, (c) URL/route gdje se dogodilo. To će presjeći od 5 kandidata na 1.

---

## Greška 1 — `TypeError: z.slice is not a function` (3 pojave)

### Isključeno (sigurno, provjereno)

- `src/lib/dayKey.ts` — `toDayKey` i `isOnOrBeforeDay` type-guardaju sve ulaze (`instanceof Date`, `typeof === 'string'`, regex prije `input.slice(0,10)`). Ima regresijski test (`src/test/dayKey.test.ts:36`) upravo za `z.slice` scenarij. Nije uzrok.
- `src/pages/Wallet.tsx:150` — zaštićeno `if (!expense.payment_source)` guardom na liniji 140 + `.startsWith('custom:')` bi puknuo prije `.slice` da payment_source nije string.
- `src/components/budget/BudgetHistoryTab.tsx:174,194` — `label` uvijek dolazi iz `format()`/`.toString()` (string), `periods` uvijek niz.
- `src/hooks/useExpenseCRUD.ts:141,213,244,983` — sve pozvano na `String(...)` ili guarded `(x || '')`.
- Sve `Date.now()...toString(36).slice(...)` i `new Date().toISOString().slice(0,10)` pozicije — pozvano na garantiranim string primitivima.

### Realni kandidati (nezaštićeni `.slice` na vrijednosti nesigurnog tipa)

| # | Datoteka | Linija | Kod | Uzrok pucanja |
|---|----------|-------|-----|---------------|
| 1a | `src/lib/decisionPdfExport.ts` | 531 | `(data.closedAt ?? data.generatedAt).slice(0, 10)` | Tipski deklarirano `string \| null` + `string`, ali ako pozivač proslijedi `Date` (npr. `now` umjesto `now.toISOString()`), padne. Nije dirnuto danas — ako se okida, vjerojatno nezavisno od današnjeg deploya. Trigger je isključivo PDF izvoz odluke. |
| 1b | `src/lib/csvParsers.ts` | 917 | `format.charAt(0).toUpperCase() + format.slice(1)` | `format` može biti proizvoljna vrijednost iz auto-detekcije; ako grana vrati non-string, padne. Nezavisno od danas. |
| 1c | *(mogući, ne pronađen statički)* | — | — | Neki od tijekom današnjeg dana dodanih call-siteova koji prosljeđuje **novo polje** (npr. `category_origin`, `recurrence_count`, `bank_row_seq`, `balance_after`) tamo gdje downstream očekuje string i radi `.slice`. Statičkim pregledom nisam našao takav call-site. |

### Veza s današnjim deployem

Ne mogu potvrditi. Nijedan **danas dodan** `.slice` poziv nema očigledan nezaštićen tip. Vrlo vjerojatno je uzrok postojeći, latentan poziv koji je aktiviran nekim novim podatkom/putem — što tek stack trace može potvrditi.

---

## Greška 2 — `TypeError: Cannot read properties of undefined` (1 pojava)

**Polje odrezano u digestu** → bez naziva polja i frame-a ovo je pogađanje. Statički najvjerojatniji kandidati iz današnje diff-e:

| # | Datoteka | Kontekst | Mogući undefined pristup |
|---|----------|----------|--------------------------|
| 2a | `src/components/dashboard/ActiveIssuesSection.tsx:126,132,135` | Novi `recurrence_count` badge | Ako neki live-updated red iz `active-issues-changed` eventa ne prođe `select("...recurrence_count")` (npr. optimistic update ili legacy row), `issue.recurrence_count` je `undefined`. Usporedbe `> 1` i `>= 10` na `undefined` daju `false` (ne baca), ali render `${issue.recurrence_count}×` ispisao bi `undefined×`. Ne baca sam po sebi — vjerojatno **nije ovo**. |
| 2b | `src/components/TransactionItem.tsx:381–389`, `TransactionDetailDialog.tsx:545–551` | Novi Sparkles badge za `category_origin` | Čita `expense.category_origin`; ako `expense` postane `undefined` u nekoj memo/comparator putanji (`prev.expense.category_origin === next.expense.category_origin` na liniji 490), padne s "Cannot read properties of undefined (reading 'category_origin')". Realan kandidat. |
| 2c | `src/components/wallet/WalletHeroCard.tsx` | Novi hero saldo | `useCustomPaymentSources()` može vratiti sources s missing `currency`/`balance`; kod već defenzivno radi `s.balance \|\| 0` — ne vidim undefined access. Manje vjerojatno. |
| 2d | `src/components/budget/BudgetCard.tsx:89–110` | Nova pace projekcija | `budget.periodStart`/`periodEnd` su Date iz `useBudgets`, ali `computeBudgetPaceSignal` radi `.getTime()` na njima. Ako ikoji code path vrati string umjesto Date, dobili bismo "Cannot read properties of undefined (reading 'getTime')" — različit oblik, ali istog reda veličine. |

### Bez punog naziva polja nema sigurne dijagnoze.

---

## Što tražim od Milana prije bilo kakvog popravka

1. **Sentry stack trace (source-mapiran) za oba errora** — file:line prvog user-code framea.
2. **Puni tekst greške 2** (koje polje, koja klasa).
3. **Route/URL** i **breadcrumbs** (koja komponenta, koji klik).
4. Ako moguće, **release SHA** koji ih generira, da potvrdimo jesu li nakon točno kojeg deploya.

## Što ne treba dirati sada

- Ništa. Ne popravljam ni jedno mjesto dok Milan ne dostavi stack trace ili eksplicitno odabere kandidata za defenzivni fix (najjači kandidat: `TransactionItem` memo comparator, 2b).

## Bilješke

- `.lovable/plan.md` **nije** dirnut u ovoj istrazi.
- Vitest nije pokrenut (nema izmjena).
- Nijedan REVOKE/migracija/edge deploy nije izvršen.
