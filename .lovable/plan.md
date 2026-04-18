
Korisnik želi treći gumb pored "Izvješća" i "Dodaj" na glavnom dashboardu — gumb sa ikonom kamere koji direktno otvara skeniranje računa (preskače dijalog za odabir).

**Trenutno stanje (`HomeHeader.tsx`):**
```tsx
<div className="flex flex-wrap items-center gap-2" data-tutorial="add-buttons">
  {!simpleModeEnabled && <ReportsDialog expenses={reportsExpenses} />}
  <AddExpenseDialog onAdd={onAddExpense} checkDuplicate={onCheckDuplicate} />
</div>
```

**Što trebam istražiti:**
- Kako `AddExpenseDialog` interno pokreće skeniranje računa (postoji li prop ili interni state koji se može aktivirati izvana, npr. `defaultMode="scan"` ili sl.)
- Postojeći `useReceiptScanner` hook + `ScanningOverlay` — mogu li se koristiti samostalno
- Kako spojiti rezultat skeniranja u flow dodavanja (vjerojatno mora otvoriti `AddExpenseDialog` s preposlanim skeniranim podacima)

Pretpostavka (provjerit ću pri implementaciji): najlakši pristup je dodati novi prop `autoScanOnOpen?: boolean` u `AddExpenseDialog`, a "Skeniraj" gumb je zapravo druga instanca `AddExpenseDialog` koja se odmah otvori u scan modu. Alternativa je samostalni gumb koji pokreće Capacitor Camera + scan flow direktno.

## Plan

### 1. Layout — jednake širine i visine
Promijeniti container u `HomeHeader.tsx`:
```tsx
<div className="grid grid-cols-3 gap-2" data-tutorial="add-buttons">
  {!simpleModeEnabled && <ReportsDialog ... className="w-full h-11" />}
  <ScanReceiptButton ... className="w-full h-11" />
  <AddExpenseDialog ... className="w-full h-11" />
</div>
```
Ako je `simpleModeEnabled`, koristim `grid-cols-2`.

Sva tri gumba dobivaju `w-full h-11` (44px — minimalni touch target po project knowledge). Trebat će proslijediti `className` prop kroz `ReportsDialog` i `AddExpenseDialog` (ako već nije).

### 2. Novi gumb "Skeniraj"
- Ikona: `ScanLine` ili `Camera` iz Lucide
- Label (i18n): `t('home.scanReceipt', 'Skeniraj')`
- Klik: otvara `AddExpenseDialog` s flagom `autoScan={true}` koji odmah pokreće kameru (na webu file picker, na nativu Capacitor Camera kroz postojeći `useNativeCamera`)
- Nakon skena → AI kategorizacija (već postoji u `useReceiptScanner`) → prikaz `ScannedDataPreview` u istom dijalogu

### 3. Boja gumba — odluka korisnika
Trenutno: `ReportsDialog` i `AddExpenseDialog` vjerojatno koriste `default` (teal primary) ili `outline`. Za novi "Skeniraj" gumb predlažem 4 opcije (postavit ću `ask_questions`):

- **A — Sva tri ista (teal primary):** Konzistentno, ali manje vizualne hijerarhije
- **B — Scan ističe se (teal primary), ostali outline:** Skeniranje je glavna brza akcija
- **C — Scan ljubičasta/violet:** AI značajka = AI boja, izdvaja se kao "pametno"
- **D — Scan zelena (success):** Pozitivna asocijacija (uštedjet ćeš vrijeme)

Pitam korisnika koju boju želi prije implementacije.

### 4. Tehničke izmjene

**`src/components/AddExpenseDialog.tsx`** (wrapper) i **`src/components/add-expense/AddExpenseDialog.tsx`** (core):
- Dodati optional prop `autoScan?: boolean`
- Dodati optional prop `triggerClassName?: string`
- Dodati optional prop `triggerLabel?: string` i `triggerIcon?: ReactNode` (za gumb "Skeniraj" koji koristi istu komponentu ali drugi izgled)
- Kad se dijalog otvori s `autoScan=true`, useEffect automatski poziva `takePhoto()` iz `useNativeCamera`

**`src/components/reports/ReportsDialog.tsx`:**
- Dodati optional prop `triggerClassName?: string` da prima `w-full h-11`

**`src/components/home/HomeHeader.tsx`:**
- Container: `grid grid-cols-3 gap-2` (ili `grid-cols-2` u simple modu)
- Renderirati dvije instance `AddExpenseDialog`:
  - Jedna kao "Skeniraj" (s `autoScan={true}`, ikona kamere, drukčija boja)
  - Druga kao "Dodaj" (postojeća, default)

### 5. i18n
Dodati ključeve u `hr.json`, `en.json`, `de.json`:
- `home.scanReceipt` — "Skeniraj" / "Scan" / "Scannen"

### 6. Što NEĆU napraviti
- Ne mijenjam `useReceiptScanner` ni AI kategorizaciju (već radi)
- Ne diram `ScannedDataPreview` ni `ScanningOverlay`
- Ne dodajem novi tutorijal step (postojeći `data-tutorial="add-buttons"` ostaje i pokriva sva tri gumba)

## Pitanje za korisnika

Prije implementacije trebam odluku o boji novog "Skeniraj" gumba — postavit ću 4 ponuđene opcije s objašnjenjima.
