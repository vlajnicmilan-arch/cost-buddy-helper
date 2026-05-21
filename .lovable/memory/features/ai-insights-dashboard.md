---
name: AI Insights Dashboard
description: Hibridni "AI uvidi" na homepage — deterministički compute (anomalije/projekcija/recurring) + AI formulacija rečenice; cache 1×/dan po korisniku; klik na karticu otvara FinancialAssistantDialog s pre-seeded promptom
type: feature
---

Sekcija "AI uvidi" ispod SummarySection u `PersonalModeView` (samo ako `!isLocalMode && aiAssistantEnabled && !simpleModeEnabled` i `allExpenses.length >= 10`).

## Arhitektura
- **Tablica** `ai_insights_cache (user_id, generated_on, insights jsonb, expense_count_at_generation, language)` — PK (user_id, generated_on), RLS per user.
- **Edge function** `generate-ai-insights`: filter personal expenses (no business_profile, exclude correction); generira kandidate s `priority` poljem. **Operativni (prio 80-100):** overdue invoices, project margin warning (<10%), project budget burn (>85% trošak / <60% vrijeme), 30d cashflow risk (recurring odljev > priljev). **Personal (prio 20-50, samo ako ≥10 personal expenses):** WoW anomalija po kategoriji, mjesečna projekcija vs budget_plans, recurring count fallback. Sort po priority desc, top 3 idu na Lovable AI Gateway (`google/gemini-2.5-flash-lite`) s tool-call `{ titles: string[] }` za formulaciju u korisnikovom jeziku. Operativne provjere ne traže personal signal (rade i za business-only korisnike).
- **Hook** `useAIInsights(enabled)` — invoke edge function jednom po mountu, instantCache snapshot (`ai-insights:v1`).
- **Komponente** `AIInsightsSection` + `AIInsightCard` (teal, Lightbulb/TrendingUp/TrendingDown ikona po severity).

## Klik flow (pre-seed prompt)
1. `AIInsightCard.onClick` → `window.dispatchEvent('ai-assistant:ask', {detail:{prompt}})`
2. `Index.tsx` listener → `setAssistantDialogOpen(true)` + setTimeout 250ms re-dispatch `ai-assistant:seed`
3. `FinancialAssistantDialog` listener (samo kad `open && canAccessAI && !isLoading`) → `sendMessage(prompt)`

## Razrez s daily summary push
- Push (21:00) = "danas" + "ovaj mjesec"
- AI uvidi = WoW anomalije + end-of-month projekcija (>5. u mjesecu) + recurring count

## i18n
- Samo `aiInsights.title` (HR/EN/DE). Sami uvidi dolaze AI-generirani u korisnikovom jeziku — ne lokaliziraju se.

## Cache invalidacija
- Drift `expense_count_at_generation` ≥20% ILI promjena jezika → regen pri sljedećem dohvatu.
