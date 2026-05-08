## Cilj
Kad korisnik otvori padajući izbornik kategorija (trošak/prihod), uvijek vidi **"+ Nova kategorija"** na vrhu, zatim prilagođene, pa standardne — bez obzira što je trenutno odabrana neka kategorija.

## Problem
Radix `Select` automatski skrola viewport tako da je trenutno odabrana stavka vidljiva pri otvaranju. Zato korisnik ne vidi "+ Nova kategorija" na vrhu, nego skoči na zadnju predloženu/odabranu kategoriju.

## Rješenje
Prisiliti viewport `<SelectContent>` da se skrola na vrh svaki put kad se otvori, koristeći `ref` na viewport i `onCloseAutoFocus` / `onOpenAutoFocus` event Radix-a.

### Pristup
1. U `src/components/ui/select.tsx` proširiti `SelectContent` da prihvaća prop `scrollToTopOnOpen?: boolean`. Kad je true, na `onAnimationStart` (ili `useEffect` kad se mountira) postavi `viewport.scrollTop = 0`. Dodati `ref` na `SelectPrimitive.Viewport`.
2. U `ManualExpenseForm.tsx` dodati `scrollToTopOnOpen` prop na oba `<SelectContent>` (expense i income).

Ovo ne mijenja postojeće ponašanje drugih `Select` komponenti — opt-in flag.

## Tehnički detalji

```tsx
// select.tsx — SelectContent
const viewportRef = React.useRef<HTMLDivElement>(null);
// na mount/open: viewportRef.current?.scrollTo({ top: 0 })
```

Trigger se izvršava unutar `SelectPrimitive.Content` `onAnimationStart` (Radix renderira content samo kad je open, pa je mount = open).

## Što se NE mijenja
- Logika kreiranja kategorija (`QuickAddCategoryInline`, `useCustomCategories`).
- Redoslijed sekcija u izborniku (već je: Nova → Prilagođene → Standardne).
- i18n ključevi.
- Drugi `Select` u aplikaciji (opt-in prop).
