

# AI Asistent → Financijski Agent s pristupom podacima

## Problem
Trenutni AI asistent prima **statičan sažetak** (10 zadnjih transakcija, ukupni iznosi) i ne može:
- Pretraživati sve transakcije po kriteriju (npr. "korekcije salda na OTP kartici")
- Filtrirati po datumu, izvoru plaćanja, kategoriji, trgovcu
- Pristupiti specifičnim detaljima o štednim ciljevima, recurring transakcijama, itd.

## Rješenje: Tool-calling pristup
Umjesto da šaljemo sve podatke u prompt (nemoguće za stotine transakcija), dajemo AI-ju **alate (tools)** koje može pozvati da dohvati točno one podatke koji su mu potrebni.

### Kako to radi za korisnika
Korisnik pita: *"Kad sam zadnji put radio korekciju salda na OTP kartici?"*
1. AI prepozna da treba pretražiti transakcije
2. AI pozove alat `search_transactions` s filterom `expense_nature=correction, payment_source=OTP`
3. Edge funkcija izvrši upit na bazu i vrati rezultate
4. AI odgovori s konkretnim podacima

### Alati koje AI dobiva

| Alat | Što radi |
|------|----------|
| `search_transactions` | Pretražuje transakcije po opisu, kategoriji, trgovcu, datumu, izvoru, tipu, expense_nature |
| `get_payment_source_details` | Dohvaća detalje izvora plaćanja (saldo, kartice, povijest korekcija) |
| `get_savings_goals` | Dohvaća štedne ciljeve i napredak |
| `get_recurring_transactions` | Dohvaća ponavljajuće transakcije |
| `get_category_analysis` | Analiza potrošnje po kategoriji za proizvoljni period |

### Što se mijenja

**1. Edge funkcija `financial-assistant/index.ts`**
- Dodati `tools` definicije u poziv prema AI gateway-u
- Implementirati **tool execution loop**: kad AI odgovori s `tool_calls`, izvršiti upite na bazu (koristeći Supabase service role) i vratiti rezultate AI-ju
- AI tada generira konačni odgovor s pravim podacima
- Streaming ostaje za krajnji odgovor korisniku

**2. Klijentska strana (`FinancialAssistantDialog.tsx` i `useFinancialAssistant.ts`)**
- Slati `user_id` (iz auth sesije) uz poruku kako bi edge funkcija mogla upitivati bazu za tog korisnika
- Zadržati postojeći statičan kontekst kao "brzi pregled" — alati služe za dublje upite
- Proširiti `recentTransactions` na 30 i dodati `payment_source` ime i `expense_nature`

**3. Bez promjena za korisnika u UI-ju**
- Korisnik i dalje tipka pitanja na isti način
- Razlika je samo u tome što AI sada može dohvatiti bilo koji podatak iz baze

### Tijek poziva (dijagram)

```text
Korisnik: "Kad sam korigirao saldo na OTP?"
     │
     ▼
[Edge Function] → AI Gateway (s tools definicijama)
     │
     ▼
AI odgovara: tool_call("search_transactions", {expense_nature: "correction", payment_source: "OTP"})
     │
     ▼
[Edge Function] → Supabase query (expenses WHERE expense_nature='correction' AND payment_source LIKE '%OTP%')
     │
     ▼
Rezultati → AI Gateway (nastavak razgovora)
     │
     ▼
AI odgovara korisniku: "Zadnja korekcija na OTP Tekućem bila je 20.03. za +150€"
     │
     ▼
[Stream prema klijentu]
```

### Datoteke koje se mijenjaju
1. **`supabase/functions/financial-assistant/index.ts`** — tool definicije + execution loop + DB upiti
2. **`src/hooks/useFinancialAssistant.ts`** — slanje auth tokena
3. **`src/components/FinancialAssistantDialog.tsx`** — proširiti kontekst (30 transakcija, payment_source ime, expense_nature)

