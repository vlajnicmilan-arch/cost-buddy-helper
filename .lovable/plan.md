# Premjesti "+ Nova kategorija" na vrh padajućeg izbornika

## Cilj
Stavka **"+ Nova kategorija"** trenutno je zadnja u `<SelectContent>`. Premjestiti je na **vrh liste** (iznad "Prilagođene" / "Standardne"), tako da je odmah vidljiva pri otvaranju Selecta — ne treba scrollati dolje.

## Izmjene

Samo `src/components/add-expense/ManualExpenseForm.tsx`:

1. **Expense Select** (oko linija ~647-661): premjestiti `__add_new__` SelectItem (s `border-b` umjesto `border-t`) na vrh `<SelectContent>`, prije bloka `customCategories`.
2. **Income Select** (analogno): isto premještanje na vrh.

Vizualno: separator (`border-b`) ide ispod gumba umjesto iznad, ostatak ostaje isti (teal boja, Plus ikona, isti i18n ključ `categories.quickAdd.button`).

## Bez promjena
- Inline mini-forma (`QuickAddCategoryInline`) — bez izmjena
- `AddExpenseDialog`, hookovi, i18n — bez izmjena
- Logika spremanja, duplikat detekcija — bez izmjena
