## Uzrok

`useProjectInvoices.addInvoice` na samom početku ima:

```ts
if (!user || !activeBusinessProfileId) return null;
```

Ako nije aktivan nijedan business profile, `INSERT` se nikad ne pošalje, dialog se zatvori, i korisnik nema feedback. Provjera baze potvrđuje:

- `project_invoices` tablica je prazna (0 redaka).
- RLS policies (`SELECT/INSERT/UPDATE/DELETE` po `auth.uid() = user_id`) su ispravne.
- U `business_profiles` postoje 2 profila za usera, **oba s `is_active = false`** → nijedan nije aktivan kao kontekst.

Korisnik je na `/index` (Dashboard), vjerojatno u Personal modu, i otvorio je račun unutar projekta (`ProjectFundingTab` embeda `ProjectInvoicesPanel`). Projekt se može vidjeti u oba moda, ali `project_invoices` je strogo vezan uz `business_profile_id` (NOT NULL u tablici + RLS preko `business_profile_id`).

## Plan popravka

1. **InvoiceDialog: guard prije save-a**
   - Ako je `activeBusinessProfileId` null kad korisnik klikne "Kreiraj", prikaži jasan `showError(t('invoices.errors.noBusinessContext', 'Računi se mogu kreirati samo unutar business konteksta. Aktiviraj tvrtku u postavkama.'))` i ne zatvaraj dialog.
   - Onemogući gumb "Kreiraj" (`disabled`) kad nema business konteksta + prikaži info chip iznad forme s istom porukom i prečacem na switcher/postavke tvrtke.

2. **useProjectInvoices.addInvoice: pretvori tihi return u explicit error**
   - Umjesto `return null` baciti `throw new Error('no_business_context')` ili pozvati `showError(...)` prije return-a, da se isti slučaj ne ponovi ni iz drugog poziva (npr. iz auto-reminders flow-a).

3. **ProjectInvoicesPanel: gate na razini panela (UX)**
   - Ako `!activeBusinessProfileId`, sakrij gumb "Novi račun" i prikaži `EmptyState` s porukom "Računi su dostupni u business modu" + CTA "Aktiviraj tvrtku" (otvara `BusinessProfileSwitcher` / postavke).

4. **i18n ključevi** (hr/en/de)
   - `invoices.errors.noBusinessContext`
   - `invoices.emptyBusinessMode`
   - `invoices.activateBusiness`

5. **Memory update**
   - Dopuniti `quotes-invoices-strategy.md`: "Računi/ponude zahtijevaju aktivan business_profile_id; UI mora to enforcati prije submit-a."

## Što NE diramo

- RLS policies (ispravne).
- Tablicu `project_invoices` (schema OK).
- Logiku PDF snapshot/auto-reminders (radi nakon što insert prođe).

## Tehnički detalji

- Fajlovi: `src/hooks/useProjectInvoices.ts`, `src/components/projects/InvoiceDialog.tsx`, `src/components/projects/ProjectInvoicesPanel.tsx`, `src/i18n/locales/{hr,en,de}.json`.
- Bez DB migracije.
- Isti pattern primijeniti i na `useProjectEstimates` ako ima isti tihi return (provjeriti pri implementaciji).
