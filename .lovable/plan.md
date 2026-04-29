# Plan: V&M Balance — Launch Readiness & Go-To-Market Pack (interni)

## Cilj
Jedan PDF dokument koji ti služi kao **interni radni plan** — što još moraš popraviti/dodati u app-u prije ozbiljnog launcha, i kako onda krenuti s reklamiranjem na EU tržištu kroz sljedećih 6-8 tjedana. Ovo nije materijal za kupca, nego tvoj checklist.

## Što će dokument sadržavati

### Dio 1 — Launch Readiness Audit (što još moraš popraviti)

Konkretne stavke izvučene iz stvarnog stanja koda i nedavnih problema:

1. **Tehnička stabilnost**
   - Riješiti otvoreni problem skenera računa na Androidu (CapacitorHttp put, diagnostics monitoring)
   - Crash/error monitoring (Sentry ili sl. — trenutno postoji samo `monitor-app-health` edge funkcija)
   - Performance baseline (loading vremena, bundle size analiza)
   - Offline ponašanje provjeriti (PWA + Capacitor)

2. **EU pravna usklađenost (must-have prije reklamiranja u EU)**
   - GDPR: Privacy Policy update (već postoji `/privacy-policy` — treba revidirati za EU specifike)
   - Cookie consent banner (PWA verzija)
   - Data Processing Agreement template
   - Right to be forgotten flow (delete account + svih podataka)
   - Data export funkcija za korisnika (već postoji parcijalno preko `fileExport.ts`)
   - Impressum (DE/AT zahtjev)
   - Pricing s PDV-om jasno označen po zemlji

3. **App Store / Play Store readiness**
   - Play Store listing dotjerati (postoji `PLAY_STORE_LISTING.md`)
   - Screenshots za 3 jezika (HR/EN/DE), 6.7" + 6.5" + tablet
   - App preview video (15-30s)
   - ASO ključne riječi za EU (research po zemljama)
   - iOS App Store priprema (ako nije gotova)
   - Data Safety / Privacy Nutrition Labels
   - Beta testing (Internal/Closed track) — minimum 2 tjedna

4. **UX polish (zadnji prolaz)**
   - Onboarding tok — testirati s 5+ realnih korisnika
   - Empty states na svim stranicama
   - Error poruke human-friendly na sva 3 jezika
   - First-run iskustvo bez intimidacije (već postoji activation funnel)
   - In-app review trigger optimizacija

5. **Podrška & feedback infrastruktura**
   - Support email + auto-responder
   - In-app feedback dugme (već postoji?)
   - FAQ stranica / Help Center (možda Notion public)
   - Status page (statuspage.io ili UptimeRobot public)
   - Discord ili Telegram zajednica

6. **Monetizacija provjera**
   - Stripe webhook robusnost (postoji `check-subscription`)
   - Trial expiry email tok (postoji `trial-reminder`)
   - Failed payment recovery
   - Refund policy dokumentirana
   - Usporedba cijena s EU konkurencijom

7. **Analitika i metrike (BEZ ovih ne znaš ide li reklamiranje)**
   - Activation rate (već postoji activation funnel)
   - DAU/MAU tracking
   - Retention cohorts (D1/D7/D30)
   - Funnel: install → signup → first transaction → 2nd week active
   - Revenue dashboard (interni admin)
   - Attribution po marketing kanalu (UTM)

### Dio 2 — Go-To-Market plan (6-8 tjedana, EU fokus)

**Tjedan 0-1: Foundation**
- Brand asseti finalizirani (logo varijante, social templates)
- Landing page (cost-buddy-helper.lovable.app → custom domain vmbalance.com)
- Email marketing setup (već postoji infrastructure)
- Analytics setup (Plausible / GA4)

**Tjedan 2-3: Soft launch**
- Beta poziv 50-100 korisnika (HR primarno)
- Product Hunt priprema (ne launch još)
- Reddit prisustvo (r/personalfinance, r/eupersonalfinance, r/Croatia)
- LinkedIn osobni profil — content priprema

**Tjedan 4-5: Content & inbound**
- Blog (5-10 SEO članaka): "Best budget app EU", "GDPR compliant finance app", lokalni keywords
- YouTube tutoriali (HR + EN)
- TikTok/Instagram Reels (3-5 demo videa)
- Suradnja s 2-3 mikro-influencera (finance niša)

**Tjedan 6-8: Paid push**
- Product Hunt launch (utorak/srijeda, EU friendly time)
- Google Ads (search) — €500-1000 test budget
- Meta Ads (Instagram) — lookalike, €500-1000
- App Store / Play Store featured submissions
- PR: tech blogovi (Netokracija, Bug.hr, t3n.de)

### Dio 3 — Konkretne TODO liste po prioritetu

- **P0 (BLOCKER za launch)**: ~10 stavki koje moraš riješiti ili nema smisla reklamirati
- **P1 (must-have za 4 tjedna)**: ~15 stavki koje značajno utječu na konverziju
- **P2 (nice-to-have)**: ~10 stavki koje možeš dodati kasnije
- Svaka stavka: opis, procjena vremena, ovisnosti

### Dio 4 — Budžet i metrike uspjeha

- Procjena troškova prvih 8 tjedana (alati, ads, dizajn, pravno)
- Definicija uspjeha: target signupi, target paid konverzija, target CAC
- "Kada NE reklamirati" signali (npr. ako D7 retention < X%)

## Tehnička izvedba

- Generirat ću PDF kroz Python (reportlab/weasyprint) konzistentan s prošlim brand pack-om
- Teal accent (HSL 172 66% 40%), iste fontove, isti stil
- ~25-30 stranica, sa checkbox-listama gdje ima smisla
- QA: konvertirati u slike i provjeriti svaku stranicu prije isporuke
- Output: `/mnt/documents/VM_Balance_Launch_GTM_Plan.pdf`

## Što ću prije generiranja PDF-a provjeriti u kodu
- Stvarno stanje: ima li već Sentry, cookie consent, impressum, FAQ, status page
- Što već postoji u `PLAY_STORE_LISTING.md` da ne dupliciram
- Postojeće edge funkcije za podršku (`monitor-app-health`, `trial-reminder`, `check-subscription`) da preporuke budu realne
- Privacy Policy stranica trenutno stanje
- Trenutni i18n pokriveni jezici (HR/EN/DE — potvrđeno)

Tako će preporuke biti **konkretno za tvoj app**, a ne generičke.

## Što NEĆE biti u dokumentu
- Pitch za kupca (to je već u prošlom packu)
- Valuacija / exit strategija
- Generičke "10 tips for app marketing" liste
- Floskule — samo akcijske stavke s rokovima

Ako odobriš, kreće generiranje. Ako želiš nešto dodati/maknuti (npr. fokus samo na HR umjesto šireg EU, ili dodati i SEO content kalendar s konkretnim naslovima članaka), reci sad.