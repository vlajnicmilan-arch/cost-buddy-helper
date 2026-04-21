

## Moja stručna preporuka

### Pitanje 1 — Tip promjene: **DA, 4 kategorije, ali kao opcionalni quick-tag**

**Preporuka:** "Razlog" (slobodan tekst) je **obavezan**, "Tip promjene" je **opcionalni chip selector** s 4 ponuđene vrijednosti.

**Zašto:**
- Slobodan tekst sam → kasnije nemaš kako filtrirati/grupirati ("Pokaži mi sve premašaje budžeta po projektu") — gubiš analitičku moć
- 4 kategorije sam → korisnik se osjeća prisiljeno klasificirati svaku sitnicu, dosadi mu, počne random klikati
- **Kombinacija** = kratak chip klik za 80 % slučajeva + slobodan tekst za nijanse → najbolje od oba svijeta

**Konkretne 4 kategorije** (provjereno u praksi gradnje/usluga):
- 🔴 **Premašaj** (overrun) — stvaran trošak veći od plana, cijene materijala, više rada
- 🟢 **Ušteda** (saving) — manje od plana, ostaje rezerva
- 🟡 **Promjena opsega** (scope_change) — investitor/klijent promijenio zahtjev
- 🔵 **Korekcija** (correction) — ispravak greške u izvornoj procjeni

Bonus: u izvještaju projekta na kraju vidiš "od 12.000 € premašaja, 8.000 € otpada na promjene opsega" → **direktan argument prema klijentu** za dodatnu naplatu.

---

### Pitanje 2 — Rezerva za nepredviđeno: **DA, automatski u predloške, ali s pametnim defaultom**

**Preporuka:** Automatski dodaj fazu **"Rezerva za nepredviđeno"** s **10 %** ukupnog budžeta projekta, **uz checkbox** "Dodaj rezervu za nepredviđeno (preporučeno)" prilikom kreiranja iz predloška — već uključen po defaultu, korisnik ga može isključiti jednim klikom.

**Zašto:**
- Industrijski standard u građevini/projektima je 5–15 % rezerve. 10 % je sigurna sredina.
- Ako ostaje opcionalna i ručna → 90 % korisnika je nikad neće dodati i opet će kukati kad pukne budžet
- Ako je nasilno obavezna → korisnik koji radi mali fiksni posao (npr. "popravak slavine za 50 €") ne treba je
- **Default-on s opt-out** = najbolja edukacija korisnika + sloboda izbora

**Tehnički detalji rezerve:**
- Posebna vizualna oznaka: 🛡️ ikona, sive boje, badge "Rezerva"
- **Ne broji se u "spent"** prikazu napretka projekta (jer nije pravi trošak nego buffer)
- Status uvijek `pending`, ne može se mijenjati u `completed`
- Prikazuje se **na vrhu** kanban prikaza, odvojena tankom linijom od "pravih" faza
- Kad neka faza povisi budžet → opcija "Povući iz rezerve" u dialogu, automatski smanjuje rezervu i bilježi 2 povezane revizije
- Kad se projekt završi s preostalom rezervom → final report kaže "Ušteda: X €" → osjećaj uspjeha

**Iznimke:**
- Ako predložak već ima fazu s imenom koje sadrži "rezerv" / "contingency" → ne dupliciramo
- Ako projekt nema `total_budget` (= 0) → checkbox sakriven, rezerva se ne nudi (nema postotka za izračun)

---

### Sažetak prijedloga

| Element | Odluka | Razlog |
|---|---|---|
| Razlog promjene | Obavezan tekst | Trag i odgovornost |
| Tip promjene | Opcionalni chip (4 opcije) | Analitika bez prisile |
| Rezerva za nepredviđeno | Auto u predlošku, default-on, 10 %, opt-out checkbox | Edukacija + sloboda |
| Postotak rezerve | 10 % fiksno u prvoj iteraciji | Kasnije može u postavke korisnika |
| Vizualno | 🛡️ siva boja, na vrhu, ne broji se u spent | Jasno odvojeno od pravih faza |

---

### Što slijedi nakon tvog odobrenja

Kreće implementacija **Razine 1 + Razine 2** iz prethodnog plana, s ovim odlukama uklopljenim:

1. Migracija: nova tablica `milestone_budget_revisions` + kolona `is_contingency` na `project_milestones`
2. `useMilestoneRevisions` hook + proširenje `updateMilestone` u `useProjectMilestones`
3. `MilestoneBudgetChangeSection` komponenta (razlog + chip tip + 3 radio opcije balansiranja)
4. `MilestoneRevisionsDialog` (povijest s filtrom po tipu)
5. Vizualni indikatori na karticama faza (📜 broj revizija, ↗/↘ trend)
6. Proširenje `applyTemplateToProject` da doda rezervnu fazu (10 %, opt-out u UI-ju kreiranja projekta)
7. Lokalizacija svih novih tekstova (HR/EN/DE)

**Reci samo "Idemo" pa krećem.**

