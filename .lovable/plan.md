

# Plan: 3 preostala poboljšanja sustava projekata

## 1. Objedinjeni prikaz troškova rada

Nova kartica na **Overview** tabu koja prikazuje konsolidirani pregled svih troškova ljudskih resursa (radnici + suradnici) na jednom mjestu.

### Što se gradi
- Sekcija na Overview tabu ispod P&L kartice
- Prikazuje ukupne troškove radnika (sati × satnica), ukupne troškove suradnika (plaćeni iznosi), i zbirni total
- Koristi podatke iz postojećeg `useProjectProfitLoss` hooka (laborCost + collaboratorCost)

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| `src/components/projects/ProjectProfitLossCard.tsx` | Proširiti s detaljnim prikazom rada — lista radnika s satima i troškovima, lista suradnika s plaćenim iznosima |
| `src/hooks/useProjectProfitLoss.ts` | Dodati detaljne podatke: lista radnika (ime, sati, trošak) i lista suradnika (ime, plaćeno, ugovoreno) |

---

## 2. Prošireni izvještaji (radnici + suradnici u exportima)

Dodavanje podataka o radnicima i suradnicima u PDF, CSV i JSON exporte projekta.

### Što se gradi
- `ProjectReportData` tip proširiti s `workers` i `collaborators` nizovima
- PDF: nova tablica "Radnici" (ime, sati, satnica, ukupno) i "Suradnici" (ime, ugovoreno, plaćeno)
- CSV: nove sekcije "--- RADNICI ---" i "--- SURADNICI ---"
- JSON: novi `workers` i `collaborators` objekti
- `ProjectReportsDialog` dohvaća podatke o radnicima/suradnicima i prosljeđuje ih u export

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| `src/lib/projectReportExport.ts` | Proširiti `ProjectReportData` tip + PDF/CSV/JSON generatore |
| `src/components/projects/ProjectReportsDialog.tsx` | Dohvatiti radnike/suradnike i proslijediti u report data |
| `src/components/projects/ProjectFullScreenView.tsx` | Proslijediti dodatne podatke u ReportsDialog |

---

## 3. Kontrola budžeta po fazama

Upozorenje kad transakcije vezane uz fazu premašuju budžet te faze.

### Što se gradi
- Na `ProjectMilestonesTab` — kartica faze prikazuje upozorenje ako je `spent > budget`
- Na `ProjectTransactionsTab` — pri dodavanju transakcije s `milestone_id`, provjera ukupnog troška faze i prikaz upozorenja ako premašuje budžet
- Na `ProjectReportsDialog` — vizualno označavanje faza koje su premašile budžet

### Nema promjena baze
Svi podaci već postoje — `expenses.milestone_id` + `project_milestones.budget`.

### Zahvaćene datoteke
| Datoteka | Promjena |
|---|---|
| `src/components/projects/ProjectMilestonesTab.tsx` | Badge/upozorenje na kartici faze kad spent > budget |
| `src/components/projects/ProjectTransactionsTab.tsx` | Upozorenje pri dodavanju transakcije koja premašuje budžet faze |
| `src/components/projects/ProjectReportsDialog.tsx` | Vizualno označavanje prekoračenih faza |

---

## Redoslijed implementacije

1. **Prošireni izvještaji** — dodavanje radnika/suradnika u exporte
2. **Objedinjeni troškovi rada** — proširenje P&L kartice s detaljima
3. **Kontrola budžeta po fazama** — upozorenja na prekoračenje

Ukupno: 0 migracija, 0 novih komponenti, izmjene u ~6 postojećih datoteka.

