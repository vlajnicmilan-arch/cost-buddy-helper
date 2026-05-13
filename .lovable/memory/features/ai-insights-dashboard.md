---
name: AI Insights Dashboard
description: Hibridni "AI uvidi" na homepage — deterministički compute (anomalije/projekcija/recurring) + AI formulacija rečenice; cache 1×/dan po korisniku; klik na karticu otvara FinancialAssistantDialog s pre-seeded promptom
type: feature
---

Sekcija "AI uvidi" ispod SummarySection u `PersonalModeView` (samo ako `!isLocalMode && aiAssistantEnabled && !simpleModeEnabled` i `allExpenses.length >= 10`).

## Arhitektura
- **Tablica** `ai_insights_cache (user_id, generated_on, insights jsonb, expense_count_at_generation, language)` — PK (user_id, generated_on), RLS per user.
- **Edge function** `generate-ai-insights`: filter personal expenses (no business_profile, exclude correction); izračuna kandidate (anomalija WoW po kategoriji ≥30% i ≥10€, mjesečna projekcija vs budget_plans, recurring fallback); pošalje top 3 na Lovable AI Gateway (`google/gemini-2.5-flash-lite`) s tool-call schema `{ titles: string[] }` da formulira na korisnikovom jeziku; upsert cache.
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
