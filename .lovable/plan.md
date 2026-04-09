

# Plan: Popravka korekcije salda

## Pronađeni problemi

1. **Nema error handlinga** — insert korekcijske transakcije može tiho propasti
2. **Zastarjeli podaci (stale state)** — saldo se čita kad se dialog otvori, a može se promijeniti do spremanja
3. **Nema refresha** — korekcijska transakcija se ne pojavi u UI-u odmah
4. **Prepisivanje polja** — `updateCustomPaymentSource` šalje `name/icon/color` nepotrebno

## Rješenje

### Datoteka: `src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx`

**handleBalanceCorrection:**
- Dohvatiti svježi saldo iz baze (`supabase.from('custom_payment_sources').select('balance').eq('id', ...)`) prije računanja razlike
- Slati samo `{ balance: newBalance }` u `updateCustomPaymentSource` — bez name/icon/color
- Dodati `try/catch` oko insert-a s `showError()` toast-om ako padne
- Ako insert padne, revertati balance natrag na stari
- Pozvati `refetch()` (expenses) nakon uspješne korekcije da se transakcija odmah prikaže

### Datoteka: `src/components/custom-payment-sources/BalanceCorrectionDialog.tsx`

- Bez promjena — dialog sam po sebi radi ispravno

### Props promjena

Komponenta treba primiti `onRefetchExpenses` callback koji se poziva nakon uspješne korekcije. Proslijediti ga iz roditelja (Index.tsx ili tko god renderira panel).

## Datoteke za promjenu

| Datoteka | Promjena |
|---|---|
| `CustomPaymentSourcesPanel.tsx` | Fresh balance fetch, error handling, samo balance update, refetch poziv |

