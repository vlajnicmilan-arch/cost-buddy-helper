## Što je provjereno u kodu

Pratio sam cijeli put: **Business mode → "Transakcije" tab → "Novo" → AddExpenseDialog → ScanLine ikona → kamera → snimka → vraćanje u app**.

### Dvije konkretne stvari koje uzrokuju zatvaranje dijaloga

#### **Uzrok #1 — DOM kontekst skrivenog AddExpenseDialog-a (95% sigurno glavni krivac)**

U `src/pages/Business.tsx` linija 142-145:

```tsx
{activeTab === 'transactions' && (
  <>
    <BusinessTransactions ... onAddClick={() => {
      const btn = document.querySelector<HTMLButtonElement>('[data-business-add-expense-trigger] button');
      btn?.click();
    }} />
    <div data-business-add-expense-trigger className="hidden">
      <AddExpenseDialog onAdd={addExpense} />
    </div>
  </>
)}
```

Problem: AddExpenseDialog je **uvjetno renderiran** (samo kad `activeTab === 'transactions'`) i živi unutar `<div className="hidden">`. To je krhko iz dva razloga:

1. **Ako se `activeTab` slučajno promijeni** dok je kamera otvorena (npr. zbog state re-rendera nakon `visibilitychange` evenata kad se vraćaš iz native kamere), **cijela komponenta se unmounta**. Tvoj scan se izvršava, ali nema ga gdje prikazati — Dashboard se vrati na vrh i izgleda kao da se "dialog ugasio".

2. **`document.querySelector` programmatic click** na hidden trigger gumb može imati problem kad Capacitor/Android lifecycle preregistrira fokus.

#### **Uzrok #2 — Validacija u `acceptScannedData` baca samo error toast (5% scenarija)**

U `src/components/add-expense/AddExpenseDialog.tsx` linija 338-346: u poslovnom modu se traže obavezna polja `merchant` i `date`. Ako AI scan ne ekstrahira jedno od njih:

- prikaže se `showError(...)` ali **dialog ostaje otvoren** — to nije uzrok zatvaranja, ali korisnik ne može spremiti i misli da je sustav slomljen.

### Dodatni nalaz (ne uzrokuje rušenje, ali smeta)

`BusinessDashboard` i ostali tabovi nemaju FAB / "+" gumb za brzo dodavanje — korisnik mora ručno otići na "Transakcije" tab i tek tamo kliknuti "Novo". Loš UX.

---

## Plan popravka

### **Korak 1: Premjestiti `AddExpenseDialog` na razinu Business stranice (glavni fix)**

Umjesto skrivenog div-a koji ovisi o `activeTab`, držati **jedan stabilan AddExpenseDialog** kontroliran kroz state na razini `Business.tsx`:

```tsx
const [addExpenseOpen, setAddExpenseOpen] = useState(false);
// ...
<AddExpenseDialog 
  onAdd={addExpense} 
  externalOpen={addExpenseOpen}
  onOpenChange={setAddExpenseOpen}
/>
```

Komponenta ostaje uvijek montirana — `activeTab` mijenjanje više ne unmounta dialog. `BusinessTransactions.onAddClick` samo poziva `setAddExpenseOpen(true)` — bez `document.querySelector` hack-a.

### **Korak 2: Dodati `externalOpen`/`onOpenChange` props u AddExpenseDialog**

Manje proširenje: prihvatiti opcijski controlled mode. Default ostaje uncontrolled (interni state) za sve postojeće pozive (HomeHeader, BusinessModeView). Samo Business.tsx koristi controlled.

### **Korak 3: Dodati FAB gumb u Business mod (UX poboljšanje)**

Plutajući "+" gumb (donji desni kut, iznad BusinessBottomNav) **vidljiv na svim tabovima** osim "Transakcije" (gdje već postoji). Klik → `setAddExpenseOpen(true)`. Tako korisnik može dodati transakciju iz Dashboard-a, Wallet-a, Reports-a — bez navigacije.

### **Korak 4: Bolji error u Business validaciji**

U `acceptScannedData`: ako fali `merchant` ili `datum`, **automatski otvoriti edit polje** s vidljivim crvenim okvirom umjesto samo error toast-a. Korisnik tako odmah vidi što treba upisati.

### **Korak 5: Diagnostic logging**

Dodati `logDiagnostic('business_scan_dialog_unmount', ...)` u cleanup AddExpenseDialog-a kada se zatvori dok je `scanning=true` ili `cameraActiveRef=true`. Tako u Pulse panelu vidim ako se ovo nastavi događati u produkciji.

---

## Datoteke koje će se mijenjati

- `src/pages/Business.tsx` — premjestiti AddExpenseDialog izvan tab condition, dodati controlled state, dodati FAB
- `src/components/add-expense/AddExpenseDialog.tsx` — dodati opcijske `externalOpen`/`onOpenChange` props, dodati diagnostic log
- `src/components/business/BusinessTransactions.tsx` — `onAddClick` prop više ne treba `document.querySelector` (samo poziva callback)

## Što očekujem nakon popravka

1. **"Snimi račun → dialog se ne gasi"** — uzrok #1 eliminiran jer komponenta ostaje montirana
2. **Brže dodavanje iz bilo kojeg tab-a** — FAB
3. **Jasnije gdje fali podataka** — auto-fokus na prazno polje + crveni okvir
4. **Vidim u Pulse-u** ako se rubni slučajevi i dalje događaju

## Što NE diram

- Sami `useReceiptScanner` i `useNativeCamera` hookovi — rade kako treba, problem je orchestrator
- `useBackButton` zaštita — već dobro implementirana, samo treba stabilan host
- Personal mod skeniranje — radi, ne diramo

## Trajanje

~15 min implementacije. Nakon deploya: idem ti pokazati kako testirati i pratim Pulse 24h.
