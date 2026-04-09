

# Plan: Strogi iznos + anti-halucinacija za recurring matcher

## Ključna promjena

Iznosi moraju biti **identični** (ne ±5%). Banka iskazuje naknade kao zasebne transakcije, pa nema razloga za toleranciju.

## Promjene

### 1. Edge function — `supabase/functions/match-recurring/index.ts`

- **`temperature: 0`** (umjesto 0.1)
- **System prompt**: eksplicitna anti-halucinacijska pravila
- **User prompt**: 
  - Iznos MORA biti identičan (ne "±5%")
  - Negativni primjeri (što NIJE match)
  - "Ako nisi siguran, NE matchaj — vrati prazan array"
- Zadržati isti model i format odgovora

### 2. Lokalni matcher — `src/hooks/useRecurringMatcher.ts`

- Linija 55: promijeniti `amountDiff > 0.05` → `amountDiff > 0.001` (praktički identičan iznos, samo floating point tolerancija)

### 3. Post-validacija AI rezultata — `src/hooks/useRecurringMatcher.ts`

Prije prihvaćanja AI matcha (linije 151-164), dodati provjeru:
- **Iznos**: `Math.abs(tx.amount) === Math.abs(rec.amount)` (tolerancija ±0.1% za zaokruživanje)
- **Tip**: `tx.type === rec.type`
- **Opis**: barem 1 zajednička riječ (≥3 slova)
- Ako ne prođe → odbaciti match
- **Confidence override**: "high" samo ako je iznos identičan I opis sadrži podstring; inače "medium"

## Datoteke

| Datoteka | Promjena |
|---|---|
| `supabase/functions/match-recurring/index.ts` | Stroži prompt, temperature 0, negativni primjeri |
| `src/hooks/useRecurringMatcher.ts` | Identičan iznos u lokalnom matcheru + post-validacija AI matcheva |

