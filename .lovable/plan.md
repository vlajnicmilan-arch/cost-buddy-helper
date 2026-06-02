# Plan

## 1. SplitPredictionHint — sakrij dok nema iznosa

**Datoteka:** `src/components/family/SplitPredictionHint.tsx`

Dodati early-return **prije** poziva `useFamilySplitPrediction` i prije loading bloka:

```tsx
if (!Number.isFinite(amount) || amount <= 0) return null;
```

Rezultat: "Računam podjelu…" spinner se više ne pojavljuje na praznoj formi. Hint se prikazuje tek kad korisnik upiše iznos > 0 na dijeljenom izvoru — što je u skladu s logikom (podjela ima smisla samo kad je izvor dijeljen **i** iznos poznat).

Hook poziv ostaje očuvan iznad uvjeta? Ne — pomičemo ga ispod guarda da izbjegnemo nepotrebne fetch-eve dok je iznos 0.

## 2. i18n — 4 ključa pod `transactions.*`

Trenutno stanje (verificirano):
- **HR**: fale sva 4 (`merchantPlaceholder`, `assignToProject`, `noProject`, `amountHint`)
- **EN**: fali 3 (ima samo `amountHint`)
- **DE**: fali 3 (ima samo `amountHint`)

Dodati u `transactions` blok:

**hr.json**
- `merchantPlaceholder`: "npr. Konzum, A1, Netflix..."
- `assignToProject`: "Pridruži projektu"
- `noProject`: "Bez projekta"
- `amountHint`: "Za decimale koristi točku ili zarez (npr. 150,50)"

**en.json**
- `merchantPlaceholder`: "e.g. Walmart, AT&T, Netflix..."
- `assignToProject`: "Assign to project"
- `noProject`: "No project"

**de.json**
- `merchantPlaceholder`: "z.B. Edeka, Telekom, Netflix..."
- `assignToProject`: "Projekt zuweisen"
- `noProject`: "Kein Projekt"

## Što NE diram

- Logiku `useFamilySplitPrediction` hooka
- `ManualExpenseForm` — prop interface je već ispravan
- Druge dijelove forme
