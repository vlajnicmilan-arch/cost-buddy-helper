
## Dijagnoza (bez izmjena)

### 1. Secrets — oba postavljena
- `GOOGLE_GEMINI_API_KEY` ✅ postavljen
- `LOVABLE_API_KEY` ✅ postavljen (managed)

Znači: **nije problem u secretima**, i nije problem u fallbacku na gateway.

### 2. Stvarna greška iz logova `financial-assistant`

Greška NIJE runtime crash pri bootu — funkcija se uredno diže (`booted 29ms`, `Listening on http://localhost:9999/`). Pada tek na **drugom turnu** razgovora, nakon što model prvi put pozove tool `create_savings_goal`:

```
Google API error: 400
"Function call is missing a thought_signature in functionCall parts.
 This is required for tools to work correctly...
 function call `default_api:create_savings_goal`, position 8/10.
 https://ai.google.dev/gemini-api/docs/thought-signatures"
status: INVALID_ARGUMENT
```

Uzrok: koristimo **preview model** `gemini-3-flash-preview` koji od nedavno zahtijeva **`thoughtSignature`** polje u svakom `functionCall` partu kad ga vratimo natrag u `contents` (na sljedećem turnu, nakon tool execution). Naš `openAIToGemini()` u `geminiClient.ts` (redak 301–306) gradi `functionCall` part samo s `{ name, args }` — bez `thoughtSignature`.

Rezultat:
- 1. turn: user pita → model vraća `functionCall` (radi OK, mi ga prevedemo u OpenAI `tool_calls` i vratimo tekst korisniku uz proposal karticu).
- 2. turn (ili nastavak istog turna kad se `assistant.tool_calls` vrati u povijesti + `tool` odgovor): šaljemo natrag `{ role: 'model', parts: [{ functionCall: { name, args } }] }` — Google odbija s 400 jer nedostaje `thoughtSignature`.

Bijeli ekran + `lineno:0` u browseru: SSE stream se ubije čim gateway helper vrati 400, klijent (`useFinancialAssistant.ts`) baci exception u `reader.read()` petlji → React state ostaje polupotrošen. To je posljedica, ne korijen.

### 3. Sekundarni šum (ne uzrokuje pad, ali smeta)
- `[aiCostCap] get_ai_monthly_spend failed: column reference "month_key" is ambiguous` — RPC `get_ai_monthly_spend` ima dvosmislenu referencu na `month_key` (vjerojatno između lokalne varijable i kolone `ai_cost_monthly.month_key`). Ne blokira poziv (cap se preskoči), ali svaki poziv troši log.

## Prijedlog popravka (za odobrenje)

**Root cause fix, bez patcheva:**

1. `supabase/functions/_shared/geminiClient.ts`
   - `openAIToGemini()`: kad gradimo `assistant`-turn iz OpenAI `tool_calls`, propagiraj `thoughtSignature` ako smo ga zabilježili u prethodnom odgovoru.
   - `geminiToOpenAIResponse()`: ekstrahiraj `part.thoughtSignature` iz Gemini odgovora i sačuvaj ga na OpenAI `tool_call` objektu (npr. `_thought_signature` custom polje).
   - Kad korisnik pošalje sljedeći turn, `financial-assistant` već šalje kompletnu povijest — signature putuje kroz `messages` prirodno.

2. `financial-assistant/index.ts`
   - Prošire tipiziran zapis `tool_calls` u chat_messages tablicu tako da `_thought_signature` preživi round-trip kroz DB (spremiti u `content` JSON metadata ili dodati `metadata` jsonb kolonu).

3. Zasebno (može u istom PR-u): popraviti `get_ai_monthly_spend` RPC — kvalificirati `month_key` s tablicom (`ac.month_key`) ili preimenovati lokalnu varijablu.

4. Regression test: dodati u `src/test/geminiClientFallback.test.ts` (ili novi `geminiToolCallRoundtrip.test.ts`) — assert da signature preživi `geminiToOpenAIResponse → openAIToGemini` round-trip.

**Ne diramo:**
- USE_DIRECT_GEMINI (ostaje `true`).
- Model pinning (`gemini-3-flash-preview` je Milanov odabir; alternativa bi bila privremeno degradirati na `gemini-3.5-flash` iz `FALLBACK_MODEL_MAP` dok Google ne pomakne signature zahtjev — reci ako želiš i tu opciju).

### Odluka koju trebam od tebe

**A)** Puni popravak (thought_signature round-trip) — točno prati Google specifikaciju, ostajemo na preview modelu.
**B)** Brzi bypass — privremeno preusmjeriti `google/gemini-3-flash-preview` → `gemini-3.5-flash` (stabilan, nema signature zahtjeva). Bez izmjene alata, ali gubimo brzinu preview modela.
**C)** Oboje: A) sada + B) kao hitni safety-net u istom deployu.
