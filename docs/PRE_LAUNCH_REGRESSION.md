# V&M Balance — Pre-Launch Regression Checklist

> Ručno proći prije svakog "Publish" prema produkciji (vmbalance.com / Play Store).
> Označi: ✅ prošlo · ⚠️ prošlo s napomenom · ❌ blocker
> Datum prolaska: __________  Verzija: __________

---

## 0. Tehnička higijena

- [ ] Build prolazi bez TypeScript errora
- [ ] Konzola u preview-u nema novih `error` poruka (warninzi iz Radix/React su OK)
- [ ] Sentry dashboard čist u zadnjih 24h (nema novih issue-ova)
- [ ] Edge functions logs — bez 5xx u zadnjih 24h
- [ ] `cloud_status` = ACTIVE_HEALTHY

---

## 1. Auth & Onboarding

- [ ] Email signup novi račun → email verifikacija stigne → klik linka loginira
- [ ] Login s krivom lozinkom prikaže poruku (ne crashea)
- [ ] "Zaboravljena lozinka" → email stigne → reset radi
- [ ] Google OAuth na webu (vmbalance.com)
- [ ] Google OAuth na nativeu (Capacitor in-app browser)
- [ ] Apple OAuth (iOS, ako primjenjivo)
- [ ] Onboarding korak 1 (project type) — mogu odabrati i preskočiti
- [ ] Onboarding korak 2 (usage_profile) — `finance_only` sakrije Projekti tab
- [ ] Onboarding korak 2 — `finance_projects` prikaže Projekti tab
- [ ] Logout → ponovni login zadržava aktivni business profil

---

## 2. Projekti (glavni adut — najviše nedavnih promjena)

- [ ] Kreiranje projekta s preset tipom — proći barem 3 različita (general, renovation, freelance)
- [ ] Project type je zaključan nakon kreiranja
- [ ] Naljepnice/labeli se prikazuju u jeziku korisnika (HR/EN/DE)
- [ ] "Tim projekta" tab postoji i ima 3 podtaba: members / workers / collaborators
- [ ] Pozivanje člana projekta — email stigne, prihvaćanje radi
- [ ] Project status line na karticama u `ActiveProjectsStrip`:
  - [ ] paused
  - [ ] justStarted (≤7 dana)
  - [ ] inProgress / inFullSwing
  - [ ] nearEnd (≤14 dana do end_date)
- [ ] AI warning (yellow/red health) ima prioritet nad status line
- [ ] Project completion wizard (3 koraka):
  - [ ] korak 1: bulk milestone complete
  - [ ] korak 2: final report (ProjectReportsDialog)
  - [ ] korak 3: end_date + arhiviranje
- [ ] "Ponovo otvori" gumb radi za completed projekte
- [ ] P&L izračun: funding vs actual usklađen s transakcijama
- [ ] Milestone budget alerts šalju push notifikaciju

---

## 3. Transakcije & Wallet

- [ ] Manual transaction (income/expense/transfer) na svim payment source tipovima
- [ ] Multi-currency: EUR, USD, GBP konverzija po ECB stopi
- [ ] Recurring transaction se generira na zakazani dan
- [ ] Installment plan: prva rata + auto-generirane rate
- [ ] Receipt scanner (Personal mode): capture → AI parse → save
- [ ] Receipt scanner (Business mode): isti flow + project/phase mapping
- [ ] Hidden payment sources toggle — Eye/EyeOff radi, dashboard se ažurira
- [ ] Balance correction (`expense_nature: correction`) ne ulazi u prihod/rashod
- [ ] Transfer matching (0.1% tolerancija) — duplicate detection radi

---

## 4. Naplata / Paywall (upravo refaktorirano)

- [ ] Paywall stranica učitava cijene bez crasha
- [ ] HR/EN/DE — sve cijene, taglines i feature liste lokalizirane
- [ ] Free tier → Pro upgrade preko Stripe Checkout
- [ ] 5s polling nakon checkouta ažurira subscription status
- [ ] Lifetime tier banner pokazuje točnu dostupnost (preostalo X)
- [ ] Customer portal radi (cancel / change plan)
- [ ] Feature gating:
  - [ ] Free: limit recurring transakcija
  - [ ] Free: limit budgeta
  - [ ] Free: scan radi (limit nije enforced — to je svjesna odluka)
  - [ ] Pro: multi-currency dostupan
  - [ ] Business: multiple company profiles
- [ ] UpgradePrompt se pokaže na pravim mjestima

---

## 5. Mobilni / Native (Capacitor)

- [ ] BottomNav redoslijed prema usage_profile
- [ ] Back button:
  - [ ] zatvara dijalog ako je otvoren
  - [ ] vraća tab umjesto izlaska iz appa na rootu
- [ ] Receipt scanner survives app pause/resume (kamera lifecycle)
- [ ] Push notifications stižu (FCM v1)
- [ ] Biometrijska autentikacija (PIN/FaceID/TouchID)
- [ ] Offline queue: napravi transakciju offline → online sync radi
- [ ] Native file export (PDF report, CSV)
- [ ] App update banner se pojavi kad je nova verzija dostupna

---

## 6. Family & Collaboration

- [ ] Kreiranje family grupe + pozivanje člana
- [ ] Shared payment source — Limited vs Full Access permissions
- [ ] Card lookup (booking po zadnja 4 broja kartice) na shared accountu
- [ ] Family chat / notes — notifikacije rade

---

## 7. Reports & Analytics

- [ ] Reports koriste `allExpenses` (cijela povijest, ne samo dashboard filter)
- [ ] PDF export reporta s pravim brendiranjem
- [ ] CSV export
- [ ] Calendar (events + reminders + recurring) i ICS export
- [ ] Cashflow forecast: 8-tjedna projekcija realna

---

## 8. Admin / Pulse

- [ ] Admin gumb vidljiv samo userima s `admin` rolom
- [ ] Pulse dashboard učitava bez 401/500
- [ ] Funnel events widget pokazuje 6 evenata
- [ ] Feedback submissions tablica popunjena testnim feedbackom

---

## 9. GDPR / Pravno

- [ ] Privacy Policy / Terms / Impressum stranice učitavaju
- [ ] Consent manager (3 kategorije) radi prije slanja analitike
- [ ] Account deletion request → email "scheduled" → 30 dana grace period
- [ ] Login unutar grace perioda otkazuje brisanje + email "cancelled"
- [ ] Email unsubscribe link radi

---

## 10. Performance

- [ ] Cold load `/home` < 3s na 4G simulaciji
- [ ] Lazy-loaded route chunks se učitavaju (provjeri Network tab)
- [ ] Slike (webp) ne premašuju 200KB u hero sekcijama

---

## Napomene s ovog prolaska

```
(slobodan prostor za QA bilješke)
```

---

## Status po dovršetku

- Blockeri (❌): _________
- Otvorena pitanja (⚠️): _________
- Spreman za Publish: ☐ DA  ☐ NE
- Odobrio: _________
