

## Word dokument: Prezentacija V&M Balance za investitora

Napravit ću profesionalan **Word dokument (.docx)** koji detaljno opisuje sve mogućnosti aplikacije V&M Balance, strukturiran za prezentaciju investitoru.

### Sadržaj dokumenta

**1. Naslovna stranica**
- V&M Balance — Investor Pitch
- Slogan: "Pametno upravljanje osobnim i poslovnim financijama"
- Datum, verzija

**2. Executive Summary**
- Što je V&M Balance
- Tržišna prilika (osobne financije + mali biznisi u regiji)
- Konkurentska prednost (dual-mode personal/business, AI, viševalutnost)

**3. Ključne mogućnosti — Osobne financije**
- Praćenje prihoda, troškova i transfera (jedinstvena baza transakcija)
- Više izvora plaćanja (gotovina, kartice, računi, digitalni novčanici) s viševalutnom podrškom i ECB tečajevima
- Kategorije (96 troškova / 32 prihoda) + custom kategorije
- Budžeti po kategorijama, dijeljenje s obitelji, povijest
- Štednje i ciljevi (Savings Goals)
- Kupnja na rate s AI prepoznavanjem i automatskim planom otplate
- Ponavljajuće transakcije (najam, pretplate)
- Korekcija salda (revizijski trag)

**4. Poslovne mogućnosti (Business Mode)**
- Više poslovnih profila s izolacijom podataka
- Dohvat podataka tvrtke iz službenog Sudreg API-ja (OIB/MBS)
- Praćenje dugovanja i zajmova (loan detection)
- Skeniranje računa s OCR + AI prepoznavanjem PDV-a
- Šihterica (time-tracking) usklađena s NN 55/2024 — 17 obveznih kolona
- Poslovni izvještaji i analitika

**5. Projektni menadžment**
- Dvorazinski sustav (osobni vs poslovni projekti)
- Faze (Milestones) s ovisnostima i Gantt prikazom
- P&L analitika po projektu
- Financiranje (budget vs actual)
- Suradnici i radnici s rolama (manager/member/viewer)
- Dnevnici rada, dnevni standup, revizije
- Javno dijeljenje projekata

**6. AI inteligencija**
- Personal CFO (Gemini Flash Lite) — uvidi, savjeti, kategorizacija
- Skeniranje računa kamerom (auto-unos)
- Prepoznavanje rata, dugovanja, ATM transfera
- Glasovno diktiranje
- AI memorija po korisniku

**7. Suradnja i dijeljenje**
- Obiteljski mod s grupnim chatom
- Dijeljeni budžeti i izvori plaćanja
- Card lookup (knjiženje na dijeljene račune preko zadnje 4 znamenke kartice)
- Pozivnice emailom, role i dozvole

**8. Izvještaji i analitika**
- Detaljni grafovi po kategorijama, izvorima, vremenu
- 8-tjedna prognoza novčanog toka
- Heatmap kalendar potrošnje
- Export u PDF, CSV, ICS (kalendar)

**9. Tehnologija i sigurnost**
- React 18 + Capacitor (web, Android, iOS)
- Lovable Cloud backend (RLS, RBAC)
- 4-znamenkasti PIN + biometrija (auto-lock 1 min)
- Email + Google + Apple OAuth
- Push notifikacije (FCM v1)
- Lokalna pohrana s "local-first" pristupom
- 3 jezika: HR, EN, DE
- Multi-currency s real-time tečajevima

**10. Monetizacija**
- **Free**: 30 transakcija/mj, 1 novčanik, 1 budžet
- **Pro (4,99 €/mj)**: neograničeno + AI + projekti
- **Business (9,99 €/mj)**: poslovni profili + šihterica + napredne značajke
- Stripe naplata, customer portal

**11. Tržišna pozicija i prilika**
- Ciljano tržište: Hrvatska + EU (HR/EN/DE lokalizirano)
- Razlike u odnosu na konkurenciju
- Roadmap

**12. Kontakt**
- Web, app, kontakt info

### Tehnička izvedba

- **Format**: `.docx` generiran s `docx-js` bibliotekom
- **Stilovi**: Inter-equivalent (Calibri/Arial), teal akcent (HSL 172 66% 40% → #22A39F)
- **Stranica**: A4, marže 1"
- **Naslovi**: H1 (24pt teal bold), H2 (18pt bold), body 11pt
- **Tablice** za cjenik i usporedbu
- **Bullet liste** za značajke
- **QA**: nakon generiranja konvertiram u PDF i pregledam svaku stranicu
- **Output**: `/mnt/documents/VM_Balance_Investor_Presentation.docx`

### Što ćeš dobiti

Jedan profesionalni Word dokument koji možeš:
- Direktno otvoriti u Wordu i editirati
- Poslati investitoru kao PDF
- Iskoristiti kao predložak za PowerPoint pitch deck (mogu napraviti i to ako želiš nakon ovoga)

### Jezik dokumenta

Napravit ću ga na **hrvatskom jeziku** (jer prezentiraš investitoru, pretpostavljam regionalnom). Ako trebaš englesku verziju za međunarodnog investitora — reci pa ću napraviti i tu.

