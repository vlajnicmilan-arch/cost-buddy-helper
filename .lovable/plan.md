

## Plan: Popravak trajnosti AI asistent postavke

### Problem
Kad korisnik isključi AI asistenta u postavkama, postavka se gubi jer:
1. Logout poziva `localStorage.clear()` na 4 mjesta u kodu (Index.tsx, PageHeader.tsx, SettingsDialog.tsx ×2)
2. Samo `theme` i `finmate-storage-config` se čuvaju nakon clear-a
3. `ai_assistant_enabled` se briše → pri ponovnoj prijavi defaultira na `true`

### Rješenje
Sačuvati korisničke postavke (AI asistent, simple mode, family mode, business mode) tijekom logout-a, isto kao što se čuva `theme`.

### Izmjene

**4 lokacije u 3 datoteke** — svaka `localStorage.clear()` treba sačuvati korisničke postavke:

1. **`src/pages/Index.tsx`** (linija ~388-391)
2. **`src/components/PageHeader.tsx`** (linija ~36-40)
3. **`src/components/SettingsDialog.tsx`** (linija ~473-477 i ~544-548)

Na svakoj lokaciji, prije `localStorage.clear()`, sačuvati ključeve:
- `ai_assistant_enabled`
- `simple_mode_enabled`
- `family_mode_enabled`
- `business_mode_enabled`

I vratiti ih nakon clear-a, zajedno s `theme` i `finmate-storage-config`.

### Rezultat
Korisničke postavke preživljavaju logout/login ciklus i restart aplikacije.

