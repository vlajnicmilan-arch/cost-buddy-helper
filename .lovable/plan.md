
# Konkurentska analiza V&M Balance — plan isporuke

## Cilj
Detaljan PDF dokument (HR jezik) koji uspoređuje V&M Balance s konkurencijom i daje prioritizirane preporuke u 4 fokusa: quick wins, strategija, monetizacija, diferencijacija.

## Konkurenti
1. **Money Manager (Realbyte)** — klasik za osobne financije, offline-first
2. **Expensify** — business expense reports, OCR, reimbursements
3. **YNAB (You Need A Budget)** — zero-based budgeting, edukativna metodologija
4. **Spendee** — moderan UI, shared wallets, bank sync
5. **Pleo** — company cards + automatizirana potrošnja
6. **Spendesk** — spend management za SME, approvals & accounting

## Izvori podataka
- **V&M Balance**: postojeća memorija projekta (mem://index + relevantni feature memo file-ovi), `package.json`, `src/lib/subscriptionTiers.ts`, `src/pages/Landing.tsx`, struktura ruta i hooks
- **Konkurenti**: web research preko `websearch--web_search` (službene stranice, pricing, App Store/Play Store opisi, recentni reviewsi); za feature parity koristim samo verificirane izvore. Gdje je podatak nesiguran → eksplicitno označeno "ne znam / nije verificirano".

## Sadržaj PDF dokumenta

### 1. Executive summary (1 str.)
Top 3 snage, top 3 slabosti, top 3 strateške preporuke.

### 2. Profil V&M Balancea (2 str.)
- Pozicioniranje (osobne + projektne + business financije, HR/EN/DE)
- Tech stack i arhitektura (PWA + Capacitor, Supabase, Lovable AI Gateway)
- Feature inventar grupiran (Core finance, Projekti, Business mode, AI, Suradnja, Native, Monetizacija)
- Monetizacijski model (Free / Pro / Business + Lifetime)

### 3. Konkurentska matrica (3-4 str.)
Tablica feature parity po kategorijama:
- Tracking & input (manual, OCR, voice, CSV, bank sync)
- Budgeting (kategorije, projekti, milestone)
- AI/automatizacija
- Multi-user / collaboration
- Business / approvals / accounting
- Reporting & exports
- Mobile/native
- Pricing & tier strukture

Za svaki red: ✓ / ✗ / partial + kratka napomena. Verificirano vs ne-verificirano jasno odvojeno.

### 4. SWOT po području (3 str.)
- Snage (npr. dual-mode personal+business, projektni P&L, Lovable AI, HR lokalizacija, native + PWA, AI insights/daily summary)
- Slabosti (npr. nema bank sync/PSD2, OCR ograničen na receipts, nema pravog approval workflowa za firme, nema accounting integracija, nema team admin konzole tipa Pleo)
- Prilike (HR/regional gap — niko ne pokriva HR business + osobno, projektni mod kao USP, AI fokus)
- Prijetnje (Spendee/Money Manager imaju snažan brand u personal segmentu, Pleo/Spendesk dominiraju B2B spend mgmt, regulatorne barijere ako se ide u fiskalizaciju)

### 5. UX/UI usporedba (1-2 str.)
Onboarding, dashboard density, dodavanje transakcije (broj koraka), AI asistent, mobile patterns. Gdje treba — kratak opis screenova konkurenata na temelju javnih materijala.

### 6. Preporuke — prioritizirano (3-4 str.)

**A. Quick wins (1-2 tjedna)**
Konkretne mikro-poboljšanja s estimacijom efekta. Primjeri kandidata:
- Polish onboardinga (smanjiti drop-off prije prve transakcije)
- "Splitanje računa" iz receipta po stavkama (već imaš `receipt_items`)
- Push prompt timing optimizacija
- Empty-state edukacija (YNAB-style mikro-tooltips)
- Widget za Android (brzi unos)

**B. Strateški smjer (3-6 mjeseci)**
- PSD2/Open Banking integracija (Tink/GoCardless) — najveća kompetitivna rupa
- Approval workflow za business mode (light verzija Pleo/Spendesk pristupa)
- Accounting export (Minimax / Pantheon / iCent — HR market) ili univerzalni e-Računi/SAF-T
- Web app polish za desktop power users (YNAB-style)
- AI agent koji proaktivno predlaže akcije (ne samo insights)

**C. Monetizacija i konverzija**
- Analiza paywall trigger točaka (gdje user udari u limit)
- Trial → paid conversion taktike (Spendee i YNAB benchmark)
- Family plan / team seats pricing
- Lifetime ofeer kao acquisition tool — kada da, kada ne
- B2B pricing prijedlog (per-seat za business mode)

**D. Diferencijacija**
- "Personal + Project + Light Business" pozicioniranje — niko od 6 konkurenata ne pokriva sva tri
- HR/EU first lokalizacija + GDPR by design kao trust signal
- Projektni P&L za freelancere/obrtnike — vlastita kategorija
- AI native (insights + daily summary + asistent već postoji) kao narativ, ne kao feature

### 7. Roadmap prijedlog (1 str.)
Kvartalni view: Q1 quick wins, Q2-Q3 strateški, Q4 diferencijacija/B2B push.

### 8. Dodatak: metodologija i izvori
Popis URL-ova, datum dohvata, ograničenja analize.

## Tehnička isporuka
- **Format**: PDF, A4, hrvatski jezik, profesionalni izgled
- **Generator**: ReportLab (Python) — koristim `skill/pdf` za QA cikluse
- **Stil**: u skladu s brand guidelines (teal HSL 172 66% 40%, Inter, čist mobile-first feel, ali optimiziran za print)
- **Grafike**: feature matrix tablice, SWOT 2×2, roadmap timeline
- **Lokacija**: `/mnt/documents/vm-balance-konkurentska-analiza.pdf`
- **QA**: pdftoppm render → vizualna inspekcija svake stranice → fix → re-render

## Što neću raditi
- Neću mijenjati izvorni kod aplikacije
- Neću izmišljati brojke (revenue, MAU, market share) ako nemam izvor — eksplicitno ću označiti "nemam podatak"
- Neću se baviti SEO/marketingom website-a osim ako se izravno tiče monetizacije

## Procjena vremena izrade
~15-25 min od tvog approvala (ovisno o broju QA iteracija).

---

**Ako ti ovaj plan paše, klikni Implement i krećem s istraživanjem konkurenata + generiranjem PDF-a. Ako želiš nešto skratiti/proširiti/promijeniti redoslijed sekcija — reci.**
