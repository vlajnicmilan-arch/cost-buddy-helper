## Strateški okvir (vrijedi za sve faze)

App je **interni alat** za praćenje novca, projekata i odnosa s klijentima — **nije** službena evidencija. Svaki dokument koji generiramo nosi disclaimer footer (već postoji `src/lib/pdfFooter.ts`).

**EKSPLICITNO ne radimo nikad:**
- Fiskalizacija (JIR/ZKI, komunikacija s PU)
- eRačun (UBL/XML, FINA servis)
- Kontni plan, temeljnice
- PDV obrasci (PDV-S, ZP, JOPPD)

**Posljedica:** ponuda i "račun" u našoj app su radni dokumenti — pomažu korisniku da zna gdje stoji, ne zamjenjuju Minimax/Pantheon/sl.

---

## Roadmap (3 faze, gradimo redom)

### Faza 1 — Polish Ponuda (ovaj plan)
Postojeći `project_estimates` + `ProjectEstimatesPanel` + `EstimateDialog` rade osnovno. Treba ih dotjerati: UX, PDF, integracija s projektom, podsjetnici klijentu.

### Faza 2 — Računi (evidencija) — *zasebna tablica, dolazi nakon Faze 1*
Nova tablica `project_invoices` (broj, datum, dospijeće, klijent, projekt, iznos, status: `issued/partially_paid/paid/overdue/cancelled`). Interni PDF "Pregled računa" s disclaimerom. Uplata = income u `expenses` s `invoice_id` linkom.

### Faza 3 — Cashflow i naplata
Aging report, dashboard widget "Neplaćeno", auto-email podsjetnici klijentu, P&L po projektu uz ponudu→račun→uplata vidljivost.

---

## FAZA 1 — Detaljan plan (ovaj sprint)

### 1.1 Vidljivost i pristup ponudama
Trenutno: `ProjectEstimatesPanel` postoji samo u `BusinessMore` (skriveno u "Više"). Korisnik teško dolazi.

- Dodati "Ponude" kao **istaknutu karticu** unutar Business mode "Posao" sekcije (ili kao podsekcija na projektu).
- Na `ProjectFullScreenView` u tabu "Novac" dodati malu sekciju **"Ponude za ovaj projekt"** koja filtrira `project_estimates` po `accepted_project_id`.
- Sa stranice projekta (prije nego postane projekt) ostaviti globalni popis u Business → Ponude.

### 1.2 EstimateDialog — UX dotjerivanje
Trenutno radi, ali:
- Dodati polje **"Projekt"** (opcionalno) — ako je ponuda vezana na postojeći projekt prije prihvaćanja (npr. dodatna ponuda za istog klijenta).
- Klijent dropdown: predložiti postojeće klijente iz prijašnjih ponuda/projekata (autocomplete iz `project_estimates.client_name` + `projects.client_name`).
- "Kopiraj iz postojeće ponude" — duplicira stavke iz druge ponude.
- Validacija: barem 1 stavka, klijent obavezan (već postoji).

### 1.3 PDF ponude (novi modul)
Postoji `src/lib/pdfFooter.ts` i `src/lib/pdfBranding.ts`. Treba kreirati `src/lib/estimatePdf.ts`:
- Generira PDF ponude s logom korisničke tvrtke (iz `business_profiles`), klijent podaci, stavke, osnovica/PDV/ukupno, valjanost, napomena.
- **Footer:** "Ovo je radna ponuda za internu komunikaciju. Nije porezni dokument." + standardni `addNotOfficialFooter`.
- Gumb "PDF" pored "Označi poslano" u `ProjectEstimatesPanel` redovima.
- Spremanje preko `fileExport.ts` (native + web).

### 1.4 Slanje ponude klijentu e-mailom
Reuse `send-transactional-email` edge funkcije.
- Gumb "Pošalji e-mailom" → dijalog s e-mail klijenta + porukom (template).
- PDF generiran client-side, postavljen kao attachment ili upload u storage + link.
- Po slanju: status `draft → sent`, log u `project_activity_log`.

### 1.5 Status flow i podsjetnici
- Trenutno: `draft/sent/accepted/rejected`. Dodati **`expired`** computed status (kad `valid_until < today` i status je `sent`).
- Vizualno upozorenje "Istječe za N dana" 7 dana prije.
- Lagani podsjetnik (push notif) korisniku 3 dana prije isteka.

### 1.6 Sitnice
- "Pretvori u projekt" gumb sada uvijek vidljiv samo na `sent` — dopusti i na `draft` (UX olakšica).
- Brojač ponuda po godini (`generateEstimateNumber`) trenutno koristi `estimates.length` — to nije pouzdano kroz godine. Promijeniti u count po godini iz baze.
- i18n: sve nove stringove u `estimates.*` namespace (HR/EN/DE).

---

## Tehnički detalji

**Datoteke koje mijenjamo (Faza 1):**
- `src/hooks/useProjectEstimates.ts` — popraviti `generateEstimateNumber` (count by year iz DB), dodati filter po `project_id`.
- `src/components/projects/EstimateDialog.tsx` — polje Projekt, autocomplete klijenta, "Kopiraj iz".
- `src/components/projects/ProjectEstimatesPanel.tsx` — PDF gumb, e-mail gumb, "Istječe za N dana" badge.
- `src/components/projects/ProjectFundingTab.tsx` — sekcija "Ponude za ovaj projekt".
- `src/components/business/BusinessMore.tsx` — ostaje, ali dodati istaknutiju ulaznu točku u "Posao".

**Nove datoteke:**
- `src/lib/estimatePdf.ts` — PDF generator (jsPDF, reuse pdfBranding + pdfFooter).
- `src/components/projects/SendEstimateEmailDialog.tsx` — dijalog za slanje.

**Bez DB migracija u Fazi 1** — tablica `project_estimates` već ima sva potrebna polja. Eventualno dodati `project_id` (osim `accepted_project_id`) ako želimo vezati prije prihvaćanja — ovisi o odluci u 1.2.

**i18n keys (novi):**
- `estimates.pdf`, `estimates.sendEmail`, `estimates.copyFrom`, `estimates.expiringIn`, `estimates.expired`, `estimates.projectLink`
- `estimates.pdf.disclaimer` — footer tekst

---

## Što NE radimo u Fazi 1 (eksplicitno odgađa)
- Tablicu `project_invoices` i UI za račune (Faza 2)
- Cashflow widget za naplatu (Faza 3)
- Auto-email podsjetnik **klijentu** za neplaćenu fakturu (Faza 3)

---

**Pitanje prije implementacije:** ide li ti ovaj redoslijed (Faza 1 prvo) ili želiš da odmah skiciram i Fazu 2 (računi) u istom planu da imaš cijeli pregled?
