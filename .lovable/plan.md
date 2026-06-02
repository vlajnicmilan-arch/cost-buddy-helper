## Cilj
Kad korisnik potroši dnevni AI limit (besplatni/pro/business), umjesto generičke "rate limit, pokušaj za minutu" poruke prikazati jasnu poruku **"Iskoristio si X/X dnevnih AI skenova. Nadogradi plan za više."** s CTA gumbom na pretplatu.

## Problem
`aiQuota.ts` vraća 429 i za:
- **Gateway rate-limit** (previše zahtjeva u kratko vrijeme) — payload: nešto drugo
- **Dnevni quota cap** — payload: `{ error: "daily_ai_limit_reached", route, limit, tier }`

Klijent (`useReceiptScanner.ts:216-218`) trenutno oba tretira isto — pokazuje "Pokušaj ponovno za minutu" što je netočno (do sutra neće raditi).

## Promjene

### 1. `src/hooks/useReceiptScanner.ts`
U 429 grani pročitati response body i razlikovati:
- ako je `error === "daily_ai_limit_reached"` → pokazati `errors.receipt.dailyLimitReached` s `{limit, tier}` interpolacijom + CTA "Nadogradi" koji otvara `/settings/subscription` (ili gdje već vodi UpgradePrompt)
- inače → postojeći `errors.receipt.rateLimit`

### 2. i18n ključevi (HR, EN, DE) u `src/i18n/locales/*`
Dodati `errors.receipt.dailyLimitReached` s placeholderima `{{limit}}` i `{{tier}}`:
- HR: "Iskoristio si dnevni limit od {{limit}} AI skenova ({{tier}} plan). Nadogradi za više."
- EN/DE analogno

### 3. Centralizacija (preporuka)
Isti 429+payload pattern vrijedi i za ostalih 9 ruta (`parse-pdf-statement`, `financial-assistant`, `generate-ai-insights`, `scan-card`, `analyze-document`, `categorize-transaction`, `detect-loans`, `match-recurring`, `parse-standup`). 

Ekstrahirati helper `src/lib/aiQuotaError.ts`:
```ts
export async function parseAiQuotaError(response: Response): Promise<
  | { kind: 'daily_limit'; limit: number; tier: string }
  | { kind: 'rate_limit' }
  | null
>
```
Vraća `null` ako nije 429. Koristi ga `useReceiptScanner` odmah; ostali pozivatelji se prebacuju usput kad ih budemo dirali (ne sad masovno).

### 4. Test
`src/lib/__tests__/aiQuotaError.test.ts` — vitest 3 case-a (daily_limit, rate_limit, ne-429).

## Što NIJE u opsegu
- Mijenjanje backend payloada (`aiQuota.ts` već vraća sve potrebno).
- Refaktor ostalih 9 ruta — ostavljamo postojeće ponašanje, helper je spreman za incremental adopciju.
- Promjena samih limita (10/100/500).
- Version bump (samo web/edge, nema native promjene).

## Verifikacija
- vitest pokriva helper
- Ručni test: na test useru spustiti limit na 1 → drugi scan → očekivati novu poruku s "1/1" i CTA-om

