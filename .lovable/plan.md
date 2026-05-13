
# AI uvidi (Insights) na Dashboard

Dodaje se nova sekcija **"AI uvidi"** na homepage, ispod kartica s prihodima/troškovima u `PersonalModeView`. Hibridni pristup: brojeve računa TypeScript, AI samo formulira rečenicu na korisnikovom jeziku.

## Razrez prema postojećim feature-ima

- **Daily summary push (21:00)** ostaje za "danas" i "ovaj mjesec".
- **AI uvidi** rade s **>7 dana** podataka: tjedne anomalije po kategoriji + predviđanja kraja mjeseca. Ne preklapa se s pushom.
- **Sakriva se** ako korisnik ima manje od 10 transakcija (nedovoljno signala).

## Tipovi uvida (max 3, prioritizirano)

1. **Anomalija po kategoriji** (najveći prioritet) — usporedba zadnjih 7 dana vs prethodnih 7 dana po kategoriji. Trigger: ≥30% odstupanje i apsolutni iznos ≥10 €. Top 1-2 anomalije.
2. **Predviđanje kraja mjeseca** — linearna projekcija `monthSpend / dayOfMonth × daysInMonth`. Ako postoji `budget_plan` za tekući mjesec → "Po trenutnom tempu završit ćeš -X € od budžeta" (pozitivno/negativno). Ako nema budgeta → "Procjena ukupne mjesečne potrošnje: Y €".
3. **Fallback** ako nema dovoljno za #1 ili #2 — recurring obnove ovog mjeseca (iz postojećeg `useRecurringTransactions`).

Deterministički motor uvijek vraća do 3 strukturirana kandidata; AI Gateway pretvara u prirodne rečenice na korisnikovom jeziku (HR/EN/DE).

## Arhitektura

```text
Dashboard (PersonalModeView)
   └── <AIInsightsSection />
          ├── useAIInsights() hook
          │      ├── instantCache read (sessionStorage)
          │      ├── DB read: ai_insights_cache (today's row)
          │      └── if missing → invoke edge function 'generate-ai-insights'
          │             ├── deterministic compute (expenses last 30d, budgets, recurring)
          │             ├── Lovable AI (google/gemini-3-flash-preview) → natural sentences
          │             └── upsert ai_insights_cache (user_id, generated_on, insights jsonb)
          └── render 1-3 teal cards with 💡 (Lightbulb icon)
                 └── onClick → opens FloatingAIAvatar chat with pre-seeded prompt
```

## Database

Nova tablica `ai_insights_cache`:
- `user_id` (FK auth users)
- `generated_on` (date)
- `insights` (jsonb array of `{ id, type, title, prompt, severity }`)
- `expense_count_at_generation` (int) — za invalidaciju ako su dodane nove transakcije
- PK `(user_id, generated_on)`
- RLS: korisnik vidi i mijenja samo svoje retke

## Edge Function `generate-ai-insights`

- CORS + JWT validation u kodu
- Učita zadnjih 30 dana `expenses` (filter: `user_id`, `type='expense'`, isključi correction nature i internal transfere — isto kao Dashboard balance logic)
- Učita aktivni `budget_plan` za tekući mjesec (ako postoji)
- Učita `recurring_transactions` koje padaju u tekućem mjesecu
- Izračuna kandidate (anomalije, projekcija, recurring count)
- Pošalje top 3 + korisnikov jezik (`profiles.preferred_language`) na Lovable AI Gateway s `tool_choice` za structured output (array of `{title, prompt}`)
- Vrati JSON; klijent upsert-a u cache

## Frontend

- `src/components/dashboard/AIInsightsSection.tsx` — render kartica
- `src/components/dashboard/AIInsightCard.tsx` — pojedina kartica (teal bg, Lightbulb ikona, klik otvara chat)
- `src/hooks/useAIInsights.ts` — fetch + cache + invalidacija
- Klik na karticu → seedа `useFinancialAssistant` chat s `prompt` poljem i otvara `FloatingAIAvatar` u expanded modu

## i18n

Novi namespace `aiInsights.*` u hr/en/de:
- `aiInsights.title` ("AI uvidi")
- `aiInsights.notEnoughData` ("Dodaj još transakcija da AI nauči tvoje navike")
- `aiInsights.refreshing`, `aiInsights.error`
- Sami uvidi su generirani od AI-a → već su na korisnikovom jeziku, ne lokaliziraju se

## Performance i troškovi

- Generira se **najviše 1× dnevno po korisniku** (PK constraint).
- Invalidira se ako `expense_count_at_generation` značajno odstupa od trenutnog (>20% ili >10 novih).
- Model: `google/gemini-3-flash-preview` (jeftin, brz). Procjena: ~500 tokena ulaz, ~150 izlaz po pozivu = zanemarivo.
- `instantCache` snapshot za instant paint dok se DB čita.

## Out of scope (za kasnije)

- "Pitaj AI o ovome" gumb u svakoj kategoriji (trenutno je cijela kartica klikabilna)
- Ručni refresh gumb (svjesno izostavljen — tjera korisnika na patternu, ne na poll-on-demand)
- Push notifikacija za uvide (potencijalno kasnije, ali sada bi bilo redundantno s daily summary)
- Integracija s Business modeom (Phase 2)

## Što se dira

**Novi fileovi:**
- `supabase/migrations/<timestamp>_ai_insights_cache.sql`
- `supabase/functions/generate-ai-insights/index.ts`
- `src/components/dashboard/AIInsightsSection.tsx`
- `src/components/dashboard/AIInsightCard.tsx`
- `src/hooks/useAIInsights.ts`

**Izmjene:**
- `src/components/home/PersonalModeView.tsx` — mount `<AIInsightsSection />` ispod kartica
- `src/i18n/locales/{hr,en,de}.json` — `aiInsights.*` ključevi
- `src/components/ai-avatar/FloatingAIAvatar.tsx` — accept `seedPrompt` prop (ili event-bus) za pre-seeded otvaranje
- Memory: dodati `mem://features/ai-insights-dashboard`
