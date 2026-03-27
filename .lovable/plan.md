

# AI Assistant: Business/Personal Mode Awareness

## Overview
The AI financial assistant currently queries all user transactions without distinguishing between personal and business modes. This upgrade will make the AI context-aware, filtering data based on the active mode and warning users when their questions cross boundaries.

## Changes

### 1. Client Side — Pass Business Context
**File: `src/components/FinancialAssistantDialog.tsx`**
- Accept `activeBusinessProfileId` and `businessProfileName` as props (from `useAppState`)
- Include `activeBusinessProfileId` and `businessProfileName` in the request body sent to the edge function

**File: Where `FinancialAssistantDialog` is rendered** (need to check, likely `Index.tsx` or `Dashboard.tsx`)
- Pass `activeBusinessProfileId` and the active profile name from `useAppState`

### 2. Edge Function — Mode-Aware Queries
**File: `supabase/functions/financial-assistant/index.ts`**

**a) Accept new parameter:**
- Extract `activeBusinessProfileId` from the request body

**b) Pass business context to `executeTool`:**
- Add `businessProfileId: string | null` parameter to `executeTool`
- In every tool's query, add filter:
  - If `businessProfileId` is set → `.eq("business_profile_id", businessProfileId)`
  - If `businessProfileId` is null → `.is("business_profile_id", null)` (personal mode only)
- Apply same logic to `custom_payment_sources`, `savings_goals`, `recurring_transactions`, `budget_plans` queries

**c) Update system prompt:**
- Add mode context section: "TRENUTNI NAČIN RADA: [Osobni / Poslovni: CompanyName]"
- Add cross-mode instruction: When user asks about data from the other mode, the AI should:
  1. Warn: "Trenutno radim u [osobnom/poslovnom] načinu. Pitanje se čini da se odnosi na [poslovne/osobne] financije."
  2. Ask for confirmation: "Želite li da pretražim [poslovne/osobne] podatke? Morat ćete prebaciti način rada."
  3. Do NOT query data from the other mode without explicit confirmation

**d) Add a new tool `detect_cross_mode_query`:**
- Not needed as a DB tool — instead, handle via system prompt instructions that teach the AI to recognize business keywords (faktura, PDV, klijent, tvrtka) vs personal keywords (osobni, kućanstvo, plaća) and warn accordingly

### 3. Technical Details

```text
Request flow:
  Client                    Edge Function
  ──────                    ─────────────
  {                         
    messages,               
    financialContext,        
    activeBusinessProfileId  → determines query filter
    businessProfileName      → injected into system prompt
  }                         

Query filter logic:
  if businessProfileId:
    .eq('business_profile_id', businessProfileId)  // business mode
  else:
    .is('business_profile_id', null)               // personal mode
```

All 11 tool functions in `executeTool` will be updated with this filter pattern. The system prompt will include clear instructions about mode boundaries and when to warn users.

