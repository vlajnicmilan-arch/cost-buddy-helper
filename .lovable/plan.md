

## Animirana povratna informacija - zelena kvačica / crveni X

### Što radimo
Zamjenjujemo sve `toast.success()` i `toast.error()` pozive s animiranom ikonom na sredini ekrana - zelena kvačica za uspjeh, crveni X za grešku. Ikona se pojavi, animira i nestane nakon ~1.2 sekunde. Framer-motion je već instaliran.

### Koraci

**1. Kreirati globalni store `src/hooks/useStatusFeedback.ts`**
- Zustand-style pattern (listener array + memoryState, kao postojeći `use-toast.ts`)
- Eksportira `showSuccess(message?)` i `showError(message?)` funkcije
- State: `{ type: 'success'|'error', message?, visible: boolean }`
- Auto-hide nakon 1200ms

**2. Kreirati komponentu `src/components/StatusFeedback.tsx`**
- Fixed overlay na sredini ekrana, `pointer-events-none`, visoki z-index
- Framer-motion `AnimatePresence` sa scale (0→1.2→1) + fade out
- Zelena `CheckCircle2` ikona (64px) za success
- Crvena `XCircle` ikona (64px) + blagi shake za error
- Opcionalni tekst ispod ikone (muted, mali font)

**3. Montirati u `src/App.tsx`**
- Dodati `<StatusFeedback />` izvan routera (globalno vidljiv)

**4. Zamijeniti toast pozive (~68 datoteka)**
- `toast.success(msg)` → `showSuccess(msg)`
- `toast.error(msg)` → `showError(msg)`
- Zadržati `toast()` pozive bez `.success`/`.error` (info toasts) ako ih ima
- Radimo postupno po grupama datoteka

### Što NE radimo
- Ne brišemo Sonner/Toaster komponente (mogu trebati za info poruke)
- Ne diramo npm pakete - sve koristi postojeće biblioteke

### Napomena
Ovo je čisto frontend promjena - nakon publishanja automatski se ažurira na mobitelu, bez ponovnog builda APK-a.

