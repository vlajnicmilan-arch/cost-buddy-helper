
# Refaktoriranje velikih komponenti

Razbijamo dvije najveće komponente na manje, održive dijelove. Funkcionalnost ostaje identična -- korisnik neće primijetiti razliku.

---

## 1. AddExpenseDialog (2304 → ~6 datoteka)

Trenutno jedna datoteka sadrži: skeniranje računa, preview skeniranih podataka, ručni unos, stavke, lokaciju, rate, duplikate, itd.

**Nove datoteke u `src/components/add-expense/`:**

| Datoteka | Sadržaj | ~Linija |
|----------|---------|---------|
| `ScannedDataPreview.tsx` | Pregled skeniranih podataka (tip, kategorija, PDV, napojnica, izvor, projekt/budžet) | ~400 |
| `ReceiptCaptureButtons.tsx` | Gumbi za kameru/galeriju, multi-page collector | ~150 |
| `ManualExpenseForm.tsx` | Ručni unos (tip, merchant, izvor, kartica, destinacija, datum, rate, projekt, budžet, lokacija, stavke, iznos, opis, kategorija, bilješka) | ~600 |
| `ExpenseItemsList.tsx` | Collapsible lista stavki (add/update/remove item) | ~120 |
| `PaymentSourceSelector.tsx` | Select za izvor plaćanja s karticama i CardLookup (koristi se u oba moda) | ~200 |
| `AddExpenseDialog.tsx` | Glavni wrapper -- state, hookovi, logika spremanja, duplicati | ~500 |

**Pristup:** State i logika ostaju u glavnoj komponenti. Podkomponente primaju props + callback-e.

---

## 2. SettingsDialog (2039 → ~7 datoteka)

Trenutno jedna ScrollArea sa svim sekcijama + 5 AlertDialoga + HelpDialog.

**Nove datoteke u `src/components/settings/`:**

| Datoteka | Sadržaj | ~Linija |
|----------|---------|---------|
| `ProfileSection.tsx` | Ime korisnika, uređivanje | ~80 |
| `AppearanceSection.tsx` | Tema, jezik | ~80 |
| `SecuritySection.tsx` | PIN, biometrija, timeout | ~120 |
| `NotificationsSection.tsx` | Zvuk, push, AI asistent, simple/family/business mode | ~200 |
| `DataSection.tsx` | Valuta, multi-currency, export, import | ~150 |
| `DangerZoneSection.tsx` | Brisanje cache-a, reset, brisanje računa + svi AlertDialozi | ~300 |
| `SettingsDialog.tsx` | Wrapper sa stanjem i handlerima, renderira sekcije | ~400 |

**HelpDialogContent** (linija 1812-2039) -- ostaje kao zasebna komponenta, ali se premješta u `src/components/settings/HelpDialogContent.tsx`.

---

## Tehnicki detalji

- Sve podkomponente koriste iste UI primitives (Dialog, Select, Switch, Button, Input)
- State ostaje u parent komponentama -- podkomponente su "prezentacijske"
- Importi se ne mijenjaju za ostatak aplikacije (`AddExpenseDialog` i `SettingsDialog` se i dalje exportaju iz istih putanja)
- Re-exporti iz originalnih putanja kako postojeci importi ne bi pucali

## Datoteke za promjenu

- **Novi direktorij:** `src/components/add-expense/` (6 datoteka)
- **Novi direktorij:** `src/components/settings/` (7 datoteka)
- **Izmjena:** `src/components/AddExpenseDialog.tsx` → re-export iz `add-expense/`
- **Izmjena:** `src/components/SettingsDialog.tsx` → re-export iz `settings/`
