

# Plan: Dodati safe-area padding na dno dijaloga transakcija

## Problem

Na Vinkinom mobitelu sistemska navigacijska traka (gesture bar / nav bar) prekriva gumb "Prikaži još" jer scrollable container nema `safe-area-inset-bottom` padding.

## Rješenje

Jedna promjena u `src/components/PaymentSourceTransactionsDialog.tsx`:

**Linija 936** — scrollable `<div>` koji završava prije `</motion.div>`:

Dodati `pb-[env(safe-area-inset-bottom,16px)]` na scrollable container (linija ~836, `<div className="flex-1 overflow-y-auto">`), ili alternativno dodati `safe-area-bottom` klasu + ekstra padding na sam gumb container.

Konkretno: na `<div className="flex-1 overflow-y-auto">` dodati `pb-safe` ili koristiti Tailwind arbitrary value:

```tsx
// Prije:
<div className="flex-1 overflow-y-auto">

// Poslije:
<div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,16px)]">
```

Ovo osigurava da na uređajima sa sistemskom navigacijom (iPhone gesture bar, Android nav bar) sadržaj ima dovoljno prostora na dnu da gumb "Prikaži još" ne bude prekriven.

## Datoteke

| Datoteka | Promjena |
|---|---|
| `src/components/PaymentSourceTransactionsDialog.tsx` | Dodati safe-area bottom padding na scroll container |

