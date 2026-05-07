# Brzo dodavanje kategorije iz padajućeg izbornika

## Cilj

U dijalogu za unos transakcije (`AddExpenseDialog` → `ManualExpenseForm`), dodati u Select kategorija stavku **"+ Nova kategorija"** koja otvara **inline mini-formu** (ne novi dijalog) za trenutno kreiranje custom kategorije. Nakon spremanja, kategorija se automatski odabire u trenutnoj transakciji.

Primjenjuje se na:
- `type === 'expense'` → koristi `useCustomCategories` (trenutno NEMA gumb, samo lista)
- `type === 'income'` → trenutno otvara puni `CustomIncomeCategoryDialog`; **mijenja se** na inline mini-formu radi konzistencije
- `type === 'transfer'` → **bez promjene** (transferi nemaju kategorije)

## UX ponašanje

1. Na dnu liste u `<SelectContent>` (ispod standardnih kategorija), separator i stavka **"+ Nova kategorija"** u boji `text-primary`.
2. Klik zatvara Select i otvara **inline panel** (Collapsible/div) ispod Select trigger-a — unutar iste forme, **bez modala preko modala**.
3. Inline forma sadrži:
   - Input "Naziv" (autofocus)
   - 6 brzih ikona (emoji) iz prvih 6 stavki `DEFAULT_CATEGORY_ICONS` / `DEFAULT_INCOME_CATEGORY_ICONS` + link "Više…" (opcionalno za kasnije)
   - 6 brzih boja iz prvih 6 stavki `DEFAULT_CATEGORY_COLORS` / `DEFAULT_INCOME_CATEGORY_COLORS`
   - Mali preview chip
   - Gumbi **Odustani** / **Spremi i odaberi**
4. Ako je naziv sličan postojećoj (custom + standardna; case-insensitive equality ili Levenshtein ≤ 2 / `includes`), prikazuje se inline upozorenje:  
   *"Slična kategorija već postoji: **Hrana**. Svejedno dodaj?"* — gumb Spremi ostaje aktivan.
5. Nakon spremanja:
   - Kategorija se kreira preko postojećih hookova (`addCustomCategory` / `addCustomIncomeCategory`)
   - `onCategoryChange(novaId)` se poziva automatski
   - Inline panel se zatvara
   - Status feedback (1200ms) potvrđuje spremanje

## Datoteke koje se mijenjaju

**Novo:**
- `src/components/add-expense/QuickAddCategoryInline.tsx` — generička inline mini-forma (props: `mode: 'expense' | 'income'`, `onCreated(id)`, `onCancel`, lista postojećih za duplikat-check)

**Izmjene:**
- `src/components/add-expense/ManualExpenseForm.tsx`
  - Dodaj `__add_new__` SelectItem i u expense Select (linije ~607-640), analogno postojećem income flowu
  - Promijeni `onAddIncomeCategoryClick` → `onQuickAddCategoryRequest(type)` (otvara inline, ne dialog)
  - Renderaj `<QuickAddCategoryInline>` ispod Select-a kad je aktivan
- `src/components/add-expense/AddExpenseDialog.tsx`
  - Ukloni `incomeCategoryDialogOpen` state i `<CustomIncomeCategoryDialog>` mount (linije ~176, ~1041, ~1082-…)
  - Dodaj lokalni state `quickAddCategoryOpen: boolean` koji se prosljeđuje formi
  - Wireup `onCreated(id)` → `setCategory(id)` + zatvori panel

**Bez izmjena:**
- `useCustomCategories`, `useCustomIncomeCategories` — postojeći API je dovoljan
- `CustomIncomeCategoryDialog` ostaje za uređivanje iz Postavki → Kategorije
- `EditTransactionDialog` — ostaje na full dialog (manje korišten flow, nema vrijednost mijenjati)
- Transfer flow

## i18n ključevi (HR/EN/DE)

Dodati u `src/i18n/locales/*.json`:
- `categories.quickAdd.button` — "+ Nova kategorija"
- `categories.quickAdd.namePlaceholder` — "Naziv kategorije"
- `categories.quickAdd.icon` — "Ikona"
- `categories.quickAdd.color` — "Boja"
- `categories.quickAdd.save` — "Spremi i odaberi"
- `categories.quickAdd.cancel` — "Odustani"
- `categories.quickAdd.duplicateWarning` — "Slična kategorija već postoji: {{name}}. Svejedno dodaj?"
- `categories.quickAdd.created` — "Kategorija dodana"

## Tehnički detalji (za developera)

- Duplikat detekcija: jednostavno `name.trim().toLowerCase()` poređenje; uključuje custom + sve standardne (`CATEGORIES` / `INCOME_CATEGORIES` s prevedenim labelima preko `t(\`categories.${id}\`)`).
- Mobile (384px): inline panel u `space-y-3 p-3 rounded-xl bg-muted/30 border`. Ikone i boje u `grid-cols-6` (umjesto 8 u punom dialogu) zbog uskog viewporta.
- Auto-focus na Input pri otvaranju (`useEffect` + `inputRef.current?.focus()`).
- Pri zatvaranju Select-a klikom na `__add_new__`: koristiti `setTimeout(..., 0)` ili `onValueChange` guard (kao postojeći income flow) da se Select pravilno zatvori prije otvaranja panela.
- Reuse `clickableProps()` iz `src/lib/a11y.ts` ako treba div-only triggers (Memory: A11y Clickable Divs).
- Status feedback preko `useStatusFeedback` (1200ms), ne toast (Memory: Status Feedback System).

## Što NIJE u opsegu

- Nema novih DB migracija
- Nema promjena u `EditTransactionDialog`, `CustomCategoriesPanel`, Postavkama
- Nema "Više ikona" expandera u prvoj iteraciji (može se dodati kasnije)
- Bez fuzzy match preko Levenshteina (samo lowercase equality + `includes`)
- Bez uklanjanja postojećeg `CustomIncomeCategoryDialog` (i dalje koristi Postavke za uređivanje)
