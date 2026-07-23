
## Dijagnoza (potvrđena iz logova)

### Secrets — oba postavljena
- `GOOGLE_GEMINI_API_KEY` ✅
- `LOVABLE_API_KEY` ✅ (managed)

### Stvarna greška
Funkcija se uredno diže (`booted 29ms`). Pada tek kad model pozove tool i idući turn se pošalje natrag Googleu:

```
Google API error: 400 INVALID_ARGUMENT
"Function call is missing a thought_signature in functionCall parts...
 function call `default_api:create_savings_goal`, position 8/10"
```

Uzrok: preview model `gemini-3-flash-preview` zahtijeva `thoughtSignature` na svakom `functionCall` partu koji vraćamo u `contents`. Naš `openAIToGemini()` u `supabase/functions/_shared/geminiClient.ts` (redak 301–306) gradi part samo s `{ name, args }`.

Posljedica u browseru: SSE stream se prekine s 400 → `useFinancialAssistant.ts` baci u `reader.read()` petlji → bijeli ekran, `lineno:0`.

### Sekundarni šum (ne blokira)
`get_ai_monthly_spend failed: column reference "month_key" is ambiguous` — RPC treba kvalificirati kolonu.

## Prijedlog popravka (za odobrenje)

1. **`supabase/functions/_shared/geminiClient.ts`**
   - `geminiToOpenAIResponse()`: izvući `part.thoughtSignature` iz Gemini odgovora, spremiti na OpenAI `tool_call` (npr. `_thought_signature`).
   - `openAIToGemini()`: kad rekonstruiramo `assistant`-turn iz `tool_calls`, upisati `thoughtSignature` natrag u `functionCall` part.
   - Streaming grana (`geminiSSEToOpenAISSE`): isto — propagirati signature kroz delte.

2. **`financial-assistant/index.ts` + `chat_messages`**
   - Osigurati da signature preživi round-trip kroz DB (spremiti u postojeći `content` JSON metadata ili dodati `metadata` jsonb kolonu na `chat_messages`).

3. **RPC `get_ai_monthly_spend`** — kvalificirati `month_key` (`ac.month_key`).

4. **Regression test** — `src/test/geminiToolCallRoundtrip.test.ts`: signature preživi `geminiToOpenAIResponse → openAIToGemini` round-trip.

**Ne diramo**: `USE_DIRECT_GEMINI` (ostaje `true`), model pinning.

### Izbor:
- **A)** Puni popravak (thought_signature round-trip)
- **B)** Brzi bypass: preusmjeriti `google/gemini-3-flash-preview` → `gemini-3.5-flash` (stabilan, nema signature zahtjeva)
- **C)** Oboje u istom deployu (preporuka za launch 28.8.)
