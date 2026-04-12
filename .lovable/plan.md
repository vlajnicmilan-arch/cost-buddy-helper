

# Plan: Popravak prikaza "Prikaži još" u transakcijama izvora plaćanja

## Problem

Gumb "Prikaži još" postoji u kodu (`PaymentSourceTransactionsDialog.tsx`, linija 921-931), ali korisnik ga ne vidi. Najvjerojatniji uzrok je **Radix ScrollArea** koji ne funkcionira ispravno u flex layoutu — Viewport komponenta ima `h-full w-full` ali ne dobiva eksplicitnu visinu od flex roditelja, pa sadržaj može biti odrezan bez mogućnosti skrolanja do dna.

## Rješenje

Zamijeniti `ScrollArea` komponentu na liniji 611 sa običnim `div` elementom koji koristi `overflow-y-auto` — ovo je pouzdanije u flex layoutima i konzistentno funkcionira na desktopu i mobilnim uređajima.

### Promjena u `src/components/PaymentSourceTransactionsDialog.tsx`:

**Linija 611**: Zamijeniti:
```tsx
<ScrollArea className="flex-1">
```
sa:
```tsx
<div className="flex-1 overflow-y-auto">
```

**Linija 936**: Zamijeniti:
```tsx
</ScrollArea>
```
sa:
```tsx
</div>
```

Ovo osigurava da:
- Sav sadržaj bude dostupan skrolanjem
- Gumb "Prikaži još" bude vidljiv na dnu liste
- Radi identično na desktopu i u nativnoj aplikaciji

## Datoteke

| Datoteka | Promjena |
|---|---|
| `src/components/PaymentSourceTransactionsDialog.tsx` | Zamjena ScrollArea s div+overflow-y-auto (2 linije) |

