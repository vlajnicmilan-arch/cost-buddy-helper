## Problem

Na screenshotu se vidi crvena pozadina i "Obriši" gumb iako korisnik nije swipeao karticu. Reveal sloj (`bg-destructive/90` + Trash2 + "Obriši") namjerno stoji `absolute inset-0` iza foreground kartice i smije biti vidljiv tek kad foreground translateX makne karticu ulijevo.

Bug je u `SwipeableNotification` (`src/components/NotificationsDropdown.tsx`, ~588):

```tsx
className={cn(
  'relative px-3 py-2 bg-popover hover:bg-muted/50 cursor-pointer ...',
  isUnread && 'bg-primary/5',
)}
```

`tailwind-merge` (preko `cn`) zadržava samo zadnju `bg-*` klasu, pa za nepročitanu obavijest `bg-primary/5` (teal s 5% alpha) potpuno zamijeni `bg-popover`. Foreground postaje gotovo proziran → crveni reveal sloj curi kroz njega, zajedno s ikonom i tekstom "Obriši".

Pročitane obavijesti rade ispravno (zadržavaju `bg-popover`).

## Fix

Razdvojiti solid base bg od unread "highlight" overlaya tako da `bg-popover` uvijek ostane primijenjen:

```tsx
className={cn(
  'relative px-3 py-2 bg-popover hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
)}
```

A za unread indikator dodati zaseban sloj unutar (npr. `before:absolute before:inset-0 before:bg-primary/5 before:pointer-events-none`) ili jednostavnije — lijevi accent border:

```tsx
isUnread && 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary'
```

Time foreground ostaje solid `bg-popover`, a unread se i dalje jasno razlikuje. Reveal sloj se vidi isključivo tokom swipea.

## Files

- `src/components/NotificationsDropdown.tsx` — samo `SwipeableNotification` className (1 mjesto, ~6 linija).

## Što NE radimo

- Bez izmjena swipe logike, thresholda, animacija.
- Bez izmjena edge funkcije ili DB.
- Bez i18n promjena.
