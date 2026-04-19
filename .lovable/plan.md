

## Plan: Reset scroll pozicije pri promjeni rute

### Problem
Kad korisnik s `/home` (dugačka stranica) klikne "Obitelj", `/family` se otvori s istom scroll pozicijom kao prethodna ruta umjesto na vrhu.

### Rješenje
Globalna `ScrollToTop` komponenta koja na svaku promjenu `pathname` poziva `window.scrollTo(0, 0)`. Rješava problem za sve rute odjednom (Wallet, Budgets, Calendar, Family, Projects).

### Datoteke
- **Nova**: `src/components/ScrollToTop.tsx` — sluša `useLocation().pathname`, resetira scroll
- **Izmjena**: `src/App.tsx` — montirati `<ScrollToTop />` unutar `<BrowserRouter>` prije `<Routes>`

### Što NE diram
- BackButtonContext, BottomNav, deep-link handling
- Pojedinačne stranice
- Scroll unutar dijaloga/sheetova (oni nisu rute)

