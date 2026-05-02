## Inline kreiranje tvrtke iz dijaloga izvora plaćanja

Korisnik može dodati novu tvrtku direktno iz `CustomPaymentSourceDialog`, bez odlaska u Postavke → Tvrtke. Strukturirani entitet `business_profiles` se zadržava (potreban za fakture, radnike, dugove, izvještaje).

### 1. Nova komponenta `src/components/business/QuickBusinessProfileDialog.tsx`

Minimalni dijalog s dva polja:
- **Naziv tvrtke*** (obavezno) → `company_name`
- **Pravni oblik** (opcionalno, dropdown: d.o.o. / j.d.o.o. / obrt / paušalni obrt / udruga / ostalo) → `legal_form`

Insert u `business_profiles` (`user_id`, `company_name`, `legal_form`, `is_active=false`).
Dispatch `business-profiles-changed` event (već se sluša u `useBusinessProfiles`).
`onCreated(newId)` callback. `z-[70]` za nested dialog. Footer napomena upućuje na Postavke za detalje.

### 2. Izmjena `CustomPaymentSourceDialog.tsx`

U `<SelectContent>` "Vlasnik izvora", ispod liste profila, dodaj non-select stavku **"+ Nova tvrtka"** koja:
- Zatvara select
- Otvara `QuickBusinessProfileDialog`
- Po `onCreated(id)` → `refetchBusinessProfiles()` → `setBusinessProfileId(id)`

### 3. i18n — `hr.json`, `en.json`, `de.json`

Dodaj pod `business.quickCreate.*`:
- `title`, `namePlaceholder`, `legalForm`, `legalFormOptional`, `hint`, `save`, `success`

I `wallet.source.addCompany` ("+ Nova tvrtka" / "+ New company" / "+ Neue Firma").

### Ne mijenja se

- Bez DB migracije
- `BusinessProfileDialog` (puni edit) ostaje netaknut
- `is_active` se ne mijenja — quick-create ne mijenja aktivnu tvrtku
- Filter logika Osobno/Poslovno na Walletu nepromijenjena
