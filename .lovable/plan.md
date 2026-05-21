## Swipe akcije na transakcijama

### Cilj
Lijevi swipe na transakciji u listi → otkriva Uredi (žuto) i Obriši (crveno). Tap na akciju je izvršava. Tap bilo gdje drugdje vraća red u zatvoreno stanje.

### Komponente

**1. Novi helper `src/lib/swipeThreshold.ts`** (pure, testabilno)
- `resolveSwipeState(deltaX, { actionWidth, openThreshold })` → `'closed' | 'open' | 'snapToOpen' | 'snapToClosed'`
- Threshold: 40% širine akcija = snap-open, ispod = snap-closed
- Max drag = širina akcija (~160px za 2 akcije × 80px)
- Vitest pokrivenost: granice, negativne vrijednosti (desni swipe ignoriran), nula

**2. Nova komponenta `src/components/SwipeableRow.tsx`**
- Props: `children`, `onEdit`, `onDelete`, `disabled`
- Koristi `framer-motion` `motion.div` s `drag="x"`, `dragConstraints={{ left: -160, right: 0 }}`, `dragElastic={0.1}`
- Akcije renderiraju se ispod (absolute, right-0), otkrivaju se kad se gornji sloj povuče
- Na `onDragEnd` → `resolveSwipeState` → animacija na 0 ili -160
- Haptic feedback (`useHaptics().success()`) kad se otvori
- A11y: akcije su pravi `<button>` s `aria-label` (i18n)
- Auto-close na tap izvan + na `selectedTransactionIds.size > 0` (disabled u bulk mode)
- Klik akcije → `e.stopPropagation()` + zatvori + pozovi handler

**3. Integracija u `TransactionListSection.tsx`**
- Wrappati postojeći `<TransactionItem>` u `<SwipeableRow>` (samo non-virtual put)
- `onEdit` → `onTransactionClick(expense)` (otvara postojeći detail dialog gdje je uredjivanje)
- `onDelete` → `onDeleteExpense(expense.id)` (već ima soft-delete + undo toast)
- `disabled={selectedTransactionIds.size > 0}`

**4. Integracija u `VirtualTransactionList.tsx`**
- Isti wrap unutar virtualne stavke

### i18n ključevi (HR/EN/DE)
- `transactions.swipe.edit` → "Uredi" / "Edit" / "Bearbeiten"
- `transactions.swipe.delete` → "Obriši" / "Delete" / "Löschen"
- `transactions.swipe.editAria` → "Uredi transakciju"
- `transactions.swipe.deleteAria` → "Obriši transakciju"

### Što NE diramo
- `onDeleteExpense` već koristi `softDelete` + 10s UNDO toast → nema novog confirm dialoga
- Bulk mode (checkbox) — swipe je disabled da se ne sudara
- `UnpaidInvoicesList` (odbačeno za ovaj iteraciju)
- Edge swipe / globalne geste
- Desni swipe (ignoriran)

### Testovi
- `src/lib/swipeThreshold.test.ts` — 6-8 case-ova za helper
- Bez testa za `SwipeableRow` render (framer-motion drag se ne testira pouzdano u jsdom; pravilo iz memorije)

### Verifikacija
- `npm test` — svi prolaze
- Browser: 384px viewport, otvori Dashboard, swipe na transakciji, provjeri otkrivanje akcija, edit otvara dialog, delete šalje u trash s undo
- Provjeriti da scroll liste i dalje radi (vertikalno) bez konflikta s horizontalnim dragom (framer-motion to handla preko `dragDirectionLock`)

### Tehnički detalji
- `framer-motion` već je dependency
- `useHaptics` već postoji
- Visina reda ostaje 52px (ne diramo `ITEM_HEIGHT` u virtualizeru)
- Akcije pozicionirane apsolutno → ne mijenjaju layout flow
