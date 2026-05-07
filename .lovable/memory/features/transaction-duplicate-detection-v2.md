---
name: Transaction Duplicate Detection
description: Strict ALL-conditions check za ručni unos; 2-of-3 scoring za CSV import
type: feature
---

Two distinct paths in `src/hooks/useExpenses.ts`:

**Manual entry — `checkDuplicate` (strict, ALL must match):**
- Egzaktan iznos (Number === Number, ne ±1%)
- Isti tip (expense/income/transfer)
- Isti kalendarski dan (setHours 0,0,0,0 → ===)
- Isti merchant (`areMerchantsSimilar`) ILI near-identical description (===, ili jedan sadrži drugi nakon lowercase+trim)
- Returns first match or null. Bez scoringa.

**Why:** Reduces false-positives. "Isti kafić 2 dana zaredom" više ne baca alarm. Realan duplikat (slučajni dvostruki klik) uvijek se događa istog dana s identičnim podacima.

**CSV import — `findDuplicates` (2-of-3 scoring):**
- Criterion 1: amount ±1% + same type
- Criterion 2: date within ±5 days
- Criterion 3: fuzzy desc/merchant match
- 3/3 = auto-skip, 2/3 + autoGen = replace offer, 2/3 normal = fuzzy review
- Looser jer uvoz mase podataka tolerira false-positive (korisnik bira u dialogu).

`scoreDuplicate` helper se koristi SAMO za import.
