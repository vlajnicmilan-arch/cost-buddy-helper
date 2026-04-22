

## Kartica Suradnici — filteri i pregled (analogno Radnicima)

### Razlika u modelu (zašto se ne može kopirati 1:1)

Suradnici nemaju satnice ni dnevne unose — model je **fiksni ugovor**:
- `total_price` (dogovoreni iznos)
- `paid_amount` (do sada isplaćeno)
- `status` (active / completed / cancelled)
- `milestone_id` (vezana faza)

Zato umjesto "sati ovog mjeseca" radimo **statuse i preostali iznos** + filtere koji imaju smisla za ugovore.

---

### Što se dodaje

**1. Filter-traka iznad popisa (mobile-first grid)**

| Filter | Tip | Opcije |
|---|---|---|
| **Status** | Select | Svi · Aktivni (default) · Završeni · Otkazani |
| **Faza** | Select | Sve faze · [popis postojećih milestona] · Bez faze |
| **Sortiraj** | Select | Najnoviji · Najstariji · Ime (A→Z) · Dogovoreno (↓) · Isplaćeno (↓) · Preostalo (↓) |
| **Pretraga** | Input | Live pretraga po imenu, prezimenu, tvrtki, opisu usluge |

Filteri u `grid grid-cols-2` na mobitelu, pretraga u zasebnom redu ispod (puna širina).

**2. Prošireni sažetak na vrhu**

Postojeća kartica "Dogovoreno / Isplaćeno ukupno" dobiva **3. red**:

```text
┌──────────────────────────────────────┐
│ Dogovoreno ukupno:        12.500 €   │
│ Isplaćeno ukupno:          7.300 €   │
│ ─────────────────────────────────    │
│ Preostalo za isplatu:      5.200 €   │  ← NOVO
│ Aktivnih: 4 · Završenih: 2           │  ← NOVO (mali brojevi)
└──────────────────────────────────────┘
```

Sažetak se računa **na temelju filtriranih suradnika** (npr. ako filtrirate samo "Aktivni", brojevi pokazuju samo njih) — isto ponašanje kao kod Radnika.

**3. Prošireni prikaz po suradniku**

Dodaje se jedan novi red na svaku karticu — **Preostalo**:

```text
┌─────────────────────────────────────┐
│ Marko Marić  [Aktivan]              │
│ 🏢 Marić d.o.o.                     │
│ Elektroinstalacije                  │
│ 🎯 Faza 2 - Instalacije             │
│                                     │
│ Dogovoreno:  3.000 €                │
│ Isplaćeno:   1.800 €                │
│ Preostalo:   1.200 €  ← NOVO        │
│ ▓▓▓▓▓▓░░░░  60%       ← NOVO progress │
└─────────────────────────────────────┘
```

Mini progress bar (1-2 px visine) vizualno pokazuje postotak isplaćenosti — zelen za <100%, plav kad je 100% (završeno).

**4. Empty state nakon filtera**

Kad filteri vrate 0 rezultata (a ima suradnika u bazi), prikaz: "Nema suradnika koji odgovaraju filterima" + gumb **Resetiraj filtere**.

---

### Tehničke izmjene

| Datoteka | Promjena |
|---|---|
| `src/components/projects/ProjectCollaboratorsTab.tsx` | Nova filter-traka (3× Select + 1× Input), `useMemo` za filtriranu/sortiranu listu, prošireni sažetak (preostalo + brojači po statusu), redak "Preostalo" + progress bar po kartici, empty state za prazan rezultat filtera |
| `src/i18n/locales/{hr,en,de}.json` | ~14 novih ključeva pod `collaborators.*`: `filterStatus`, `filterMilestone`, `sortBy`, `search`, `allStatuses`, `allMilestones`, `noMilestone`, `sortNewest`, `sortOldest`, `sortName`, `sortAgreed`, `sortPaid`, `sortRemaining`, `remaining`, `remainingTotal`, `activeCount`, `completedCount`, `noResults`, `resetFilters` |

### Što se NE mijenja

- Tablica `project_collaborators` (samo se koriste postojeća polja)
- RLS politike
- Hook `useProjectCollaborators` (sva logika filtera je klijentska, kao kod Radnika)
- Dijalog za dodavanje/uređivanje (`ProjectCollaboratorDialog`)
- Logika dozvola (`isManager`)
- Drugi tabovi projekta

### Očekivani ishod

- Otvoriš projekt → tab **Suradnici** → odmah vidiš samo aktivne (default), s preostalim iznosima i progress barovima
- Promjenom filtera Status/Faza odmah dobiješ presjek (npr. "svi suradnici za fazu Krov")
- Sortiranje po "Preostalo (↓)" — vidiš kome najviše duguješ
- Pretraga po tvrtki ili usluzi — brzo nađeš tko je radio elektroinstalacije
- Sažetak gore reagira na filtere — ako gledaš samo "Aktivne", vidiš njihove totale
- Sve i dalje radi na 384 px viewportu

