# Plan

## Cilj
Pojačati vidljivost gumba "Višestraničan račun" u `ReceiptCaptureButtons.tsx` (linija 108).

## Trenutno stanje
```
className="w-full gap-2 rounded-xl border-dashed border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/40"
```
Border je `border-border/70` (svjetlosivi, 70% opacity) + dashed — gubi se na pozadini.

## Promjena
Koristiti **primary (teal)** boju iz design sistema — već je dominantna boja appa i sklada se s plavim/zelenim CTA gumbima iznad:

```
className="w-full gap-2 rounded-xl border-dashed border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/70"
```

- `border-primary/50` umjesto `border-border/70` → jasno vidljiv teal obrub
- `bg-primary/5` → suptilna teal pozadina (slično CTA gumbima Foto/Galerija)
- `text-primary` → tekst i ikona u teal boji
- Dashed ostaje (signalizira "secondary action")
- Dark mode radi automatski jer `primary` token je theme-aware

## Što NE diram
- Funkcionalnost gumba
- Plavi/zeleni CTA gumbi iznad
- Multi-image collector blok (ima već vlastiti border)
