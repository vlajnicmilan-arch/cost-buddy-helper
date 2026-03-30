

## Plan: Ukloni PDV pregled + Redefiniraj tier strukturu

### Dio 1: Ukloni PDV modul

**Obrisati datoteke:**
- `src/components/business/BusinessVATOverview.tsx`

**Ažurirati `BusinessMore.tsx`:**
- Ukloniti import `BusinessVATOverview`
- Ukloniti `'vat'` iz `SubView` tipa
- Ukloniti `if (view === 'vat')` renderiranje
- Ukloniti menu stavku za PDV pregled (id: `'vat'`)
- Ukloniti import `FileText` ikone (ako se više ne koristi)

**Ažurirati `businessModules.ts`:**
- Ukloniti `'vat_tracking'` iz `ModuleId` tipa i `MODULES` niza
- Ukloniti `'vat_tracking'` iz svih `INDUSTRIES` recommended/optional lista

### Dio 2: Redefiniraj tier strukturu (Paywall + Landing + Feature access)

Nova struktura:

| Free | Pro (ključni) | Business/Advanced |
|------|---------------|-------------------|
| Osnovno praćenje | Neograničeni projekti | Radnici i satnice |
| Transakcije (30/mj) | Budžeti | Timski pristup |
| Limit OCR (5/mj) | AI uvidi | Suradnici na projektima |
| 1 novčanik | Više novčanika | Napredni projekti |
| 1 budžet | Osobno + jednostavno poslovno | Višekorisnički pristup |

**`src/pages/Paywall.tsx`:**
- Ažurirati `PRO_FEATURES` listu:
  - Neograničene transakcije, Neograničeni projekti, Neograničeni budžeti, AI financijski asistent, Više novčanika, CSV/PDF uvoz i izvoz, Detaljni izvještaji, Jednostavno poslovno praćenje
- Ažurirati `BUSINESS_FEATURES` listu:
  - Sve iz Pro, Radnici i satnice, Timski pristup, Suradnici na projektima, Napredni projekti, Višekorisnički pristup
- Pro subtitle: "Za većinu ljudi" umjesto "Za osobne financije"
- Business subtitle: "Za ozbiljne korisnike" umjesto "Za poduzetnike"
- Premjestiti "Najpopularniji" badge na Pro plan (umjesto Business)

**`src/hooks/useFeatureAccess.ts`:**
- Premjestiti `projects` i `business_module` na `'pro'` tier (osnovni poslovni pristup)
- Dodati nove feature-e za business tier: `'team_access'`, `'collaborators'`, `'advanced_projects'`, `'workforce'`

**i18n (`hr.json`, `en.json`, `de.json`) — landing pricing sekcija:**
- Free: "Do 30 transakcija/mj", "1 izvor plaćanja", "1 budžet", "Skeniranje računa (5/mj)"
- Pro: "Sve iz Besplatnog", "Neograničeni projekti i budžeti", "AI uvidi i izvještaji", "Osobno + poslovno praćenje"
- Business: "Sve iz Pro", "Radnici i satnice", "Timski i višekorisnički pristup", "Napredni projekti sa suradnicima"
- Pro postaje "popular" umjesto Business

**Landing testimonials:**
- Ivan P. recenzija: zamijeniti "Funkcije fakturiranja..." s nečim relevantnim za praćenje projekata

**Landing footer desc:**
- "Vaš financijski kontrolni centar" umjesto "pratitelj financija"

---

### Ukupno: ~8 datoteka za izmjenu, 1 datoteka za brisanje

