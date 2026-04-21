

## Odgovor: nije idealna postavka — to je trenutni dizajn, ali nije logičan

### Trenutno stanje (kako je sad implementirano)

U sustavu postoje **3 uloge** na projektu:

| Uloga | Može uređivati faze | Vidi prekoračenja (📜 trend) | Prima notifikacije |
|---|---|---|---|
| **Manager (Voditelj)** | ✅ Da | ✅ Da | ✅ Da |
| **Member (Punopravni član)** | ❌ **Ne** | ❌ **Ne** | ❌ Ne |
| **Viewer (Promatrač)** | ❌ Ne | ❌ Ne | ❌ Ne |

**Konkretno za Test:** ima ulogu "Punopravni član" (member), ali sav UI za faze (gumb Uredi, badge revizija, glow upozorenja) skriven je iza `isManager`. Trenutno je **Member ≈ Viewer** kad su faze u pitanju — jedina razlika je što Member može dodavati transakcije bez odobrenja, a Viewer treba odobrenje.

To znači da "Punopravni član" zapravo nije punopravan — ne može sudjelovati u upravljanju budžetom faza ni vidjeti rizike.

### Zašto to nije logično

1. **Naziv obmanjuje:** "Punopravni član" sugerira jednake mogućnosti kao manager, ali u praksi vidi manje od onoga što treba za rad.
2. **Slijepa odgovornost:** Member mora donositi odluke o trošenju, ali ne vidi koliko je faza prekoračila ni povijest revizija.
3. **Bottleneck na manageru:** sve promjene budžeta moraju ići kroz Dujeta, Test ne može pomoći ni kad je očito.

---

## 3 opcije — odaberi koja ti odgovara

### Opcija 1 — "Member vidi sve, ali ne mijenja" ⭐ preporučeno
- Member **vidi** sve: badge revizija 📜, trend strelice ↗↘, glow upozorenja, gumb "Povijest"
- Member **ne može**: uređivati budžet faze, brisati faze, drag & drop u Kanbanu
- Manager zadržava puna prava
- Viewer ostaje kako je (ne vidi povijest revizija)

**Prednost:** Test odmah razumije stanje projekta i može alarmirati Duje. Bez rizika od neovlaštenih izmjena.

### Opcija 2 — "Member može sve osim brisanja"
- Member **vidi sve i može uređivati** budžete faza (s obaveznim razlogom revizije — sve se loga)
- Member **ne može**: brisati faze, mijenjati strukturu (dodavati/uklanjati), drag & drop
- Manager + brisanje + struktura
- Viewer ostaje kako je

**Prednost:** Pravi "punopravni" član. Audit trag postoji kroz revizije.
**Rizik:** Više ljudi mijenja budžete — može stvoriti zbrku ako tim nije discipliniran.

### Opcija 3 — Granularne dozvole po članu
- Postojeća `ProjectMemberPermissionsDialog` (Shield ikona) proširena s prekidačima:
  - "Može uređivati faze" (on/off)
  - "Može vidjeti povijest revizija" (on/off)
  - "Može brisati faze" (on/off)
- Manager za svakog člana posebno odlučuje

**Prednost:** Maksimalna fleksibilnost.
**Mana:** Više klikanja pri postavljanju, više kompleksnosti za korisnika koji nije programer.

---

## Moja preporuka

**Opcija 1** — najmanja promjena, najveća korist, nema rizika:
- Rješava tvoj točan problem (Test ne vidi prekoračenja)
- Zadržava jasnu hijerarhiju (samo manager mijenja)
- Kasnije možemo na Opciju 2 ako Test traži više
- Bez izmjena baze, samo UI gating

### Implementacija Opcije 1 (ako odobriš)

**Datoteke:**
- `ProjectMilestonesTab.tsx` — promijeniti `{isManager &&` → `{` na badge sekciji (linija ~292), gumb Uredi/Briši (linija ~366) ostaje pod `isManager`
- `MilestoneKanban.tsx` — prikazati `MilestoneRevisionTrendBadge` i glow svima; drag & drop, edit/delete gumbi ostaju samo manageru
- `MilestoneRevisionsDialog.tsx` — već prima `canEdit` prop, samo ga otvoriti svima za čitanje
- Bez izmjena hooka, baze, ni notifikacija

**Vrijeme:** ~10 minuta.

---

**Reci 1, 2 ili 3 (ili "nešto drugo").**

