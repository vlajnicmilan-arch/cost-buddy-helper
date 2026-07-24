
# Mišljenje: Wallet UX redizajn (točka 11)

Ovo je **mišljenje + preporučeni scope**, nije naredba za gradnju. Odluka je tvoja.

---

## Odgovori na pitanja

### 1) Komplicira li išta ukupni saldo?

Da, tri stvari — sve rješive, ali moraju se **eksplicitno** riješiti u prvom PR-u:

- **Skriveni računi** (`useHiddenPaymentSources` / `hiddenIds`). Dashboard već filtrira sakrivene (`PaymentSourcesSection.tsx:23-26`). Wallet mora **prikazivati sakrivene** (to je mjesto gdje ih user upravlja), pa hero saldo mora imati eksplicitni toggle: *"Uključi sakrivene"* — inače user vidi različit total na Home vs Wallet i ne zna zašto.
- **Business/personal split** — `Wallet.tsx` je Personal ruta; Business ima svoj `BusinessWallet.tsx`. Već su izolirani preko `business_profile_id` u `useCustomPaymentSources`. Nema kontaminacije, ali hero mora jasno reći *"Osobno"* / *"[Naziv tvrtke]"* da user zna koji kontekst gleda.
- **Viševalutnost** — `PaymentSourcesSection` već ima referentnu implementaciju (`useExchangeRates.convert` + `multiCurrencyEnabled`). Reuse ga direktno, ne reimplementiraj. Kad je `multiCurrencyEnabled=false`, samo prikaži naivni sum s napomenom valute.
- **Dijeljeni računi** — kod ima `isOwned` flag i `ownedPaymentSources` selektor. Panel već koristi *owned*. Odluka: hero saldo = **samo owned** (novac koji je *tvoj*), ili **owned + shared-with-you** (novac kojim *raspolažeš*). Preferiram *owned only* jer je matematički čisto i konzistentno s onim što Home već zbraja.

### 2) "..." meni vs reorder mode — je li čist?

Čist je, ali samo ako `reorderMode` ostane **modalno stanje panela** kako je već implementiran (`CustomPaymentSourcesPanel.tsx:58`, `Switch` na vrhu). U reorder modu: sakrij "..." meni potpuno, prikaži samo `GripVertical`. U normal modu: "..." s Eye/Users/Pencil/Trash. To je već arhitekturalni pattern (touch handlere gate-a `reorderMode`), pa "..." samo dodaje treću granu na postojeći `if (reorderMode)` — nema novog stanja.

**Upozorenje**: `Trash` u "..." meniju povećava rizik nenamjernog brisanja. Traži destructive confirm koji već imate.

### 3) Redoslijed sekcija

Trenutno: Računi → Prijenosi → Rate → Ciljevi → Novčani tok → Kategorije → Open Banking → Uvoz → Backup.

Preporuka (po frekvenciji uporabe i mentalnom modelu *"koliko imam / gdje mi novac ide"*):

```text
1. Hero total + Računi              ← "koliko imam"
2. Ciljevi štednje                  ← "gdje želim da ide"
3. Rate / Installments              ← "što me čeka"
4. Prijenosi (mjesečni sažetak)     ← "kako se kreće između računa"
5. Cashflow forecast                ← "što će biti"
─────────── Postavke novčanika (collapsible) ───────────
6. Kategorije
7. Open Banking / Bank connection
8. Uvoz (CSV/PDF, ako nije u header meniju)
9. Backup / Restore
```

Razlog: 1-5 su *stanje i planiranje*; 6-9 su *konfiguracija* koja se dira jednom u par mjeseci. To potvrđuje tvoju hipotezu C.

### 4) bank_match_status agregacija — realno za ovaj sprint?

**Preskoči za post-launch.** Razlozi:

- Semantika nije stabilna za sve unosa (`manual` vs `pending_bank` vs `bank_only` vs `confirmed` — vidi `bankMatchStatus.ts`). CSV/PDF uvoz je `bank_only`, ručno je `manual`, samo `custom:UUID` s linked bank accountom postaje `pending_bank`. Većina usera nema linked bank → agregacija bi svima izgledala kao *"100% manual"* i djelovala beskorisno.
- Launch je 28.8.2026; svaki dan koji trošiš na ovo je dan manje za regresiju hero/kolapsa/hijerarhije koji **svi useri** vide odmah.
- Kad Bank Sync roadmap (vidi mem) dođe do faze u kojoj većina usera ima linked račun, tada agregacija ima signal. Do tada je vizualni šum.

Realistična kompromisna verzija za launch: **jedan mali badge** na *individualnom* računu ako je `linked_payment_source_id` prisutan (npr. "Povezano ✓"), bez globalne agregacije. To je jeftino i educira usere o featureu.

### 5) Što još je relevantno a nismo spomenuli

- **`WalletViewModeContext`** postoji kao *single source of truth* za view mode (mem: wallet-view-mode-unified). Bilo koji novi toggle (npr. "uključi sakrivene u totalu") mora ući ovdje, ne u lokalni state Wallet.tsx.
- **`AttributionSheet` deep linkovi** (`?openSourceCreate`, `?voidedAttribution`, `?highlight`) — svaki redizajn liste računa mora sačuvati anchor točke koje AttributionSheet cilja (source klik otvara `PaymentSourceTransactionsDialog`). Ako "..." meni proguta `onClick` na kartici, deep link puca.
- **`data-tutorial="payment-sources"`** marker postoji na Home (`PaymentSourcesSection`). Provjeri koristi li tutorial isti marker u Walletu — ako da, novi hero ne smije razbiti tutorial highlight.
- **`data-testid="summary-balance"`** je već na Home. Ako dodaš isti na Wallet hero, e2e testovi (`e2e/flows/`) mogu ga reusati.
- **`SavingsGoalsSection`, `InstallmentsPanel`, `WalletTransfersCard`** — svaki ima svoju vizualnu težinu (glass-card, veliki brojevi). Ako hero total dođe iznad, ovi moraju vizualno "spustiti glas" (manji naslov, manji broj) inače hero se izgubi.
- **`PageHeader`** već pruža slot za akcije (import trigger). Provjeri hoće li se "..." meni izvora sudariti s ikonama u PageHeaderu na mobilnom (384px).

---

## Preporučeni scope (ako Milan odobri)

**PR1 — Hijerarhija i hero (visoka vrijednost, nizak rizik):**
- Hero card iznad `CustomPaymentSourcesPanel`: total owned balance, toggle *Uključi sakrivene*, prikaz konteksta (Osobno / naziv tvrtke), FX preračun reused iz `PaymentSourcesSection`.
- Reorder sekcija po preporuci iz #3.
- Collapsible *"Postavke novčanika"* koji obuhvaća Kategorije + Open Banking + Bank Connection + Backup. Default: zatvoreno.

**PR2 — "..." meni po računu (srednji rizik zbog reorder/deep link/tutorial interakcije):**
- Eye/Users/Pencil/Trash u DropdownMenu. Ostavi kartici jedan primarni tap = otvori transakcije.
- Reorder mode i dalje sakriva meni i prikazuje samo grip.
- Destructive confirm za Trash.

**PR3 — Post-launch:**
- bank_match_status agregacija (kad Bank Sync ima kritičnu masu).
- Per-source "Povezano ✓" badge može ući u PR1 ili PR2 ako je jeftino.

**Ne diram:** business_profile isolation, WalletViewModeContext, useCustomPaymentSources, deep link protokol (`?highlight`, `?openSourceCreate`), tutorial markere, testide.

---

## Otvoreno pitanje za tebe

Prije nego pređemo u build:

- **Hero saldo — owned only ili owned + shared-with-you?** Utječe na semantiku "koliko imam" i konzistentnost s Home. Moja preporuka: **owned only**, uz mali sekundarni redak *"+ X€ na dijeljenim računima"* ako je vrijednost > 0.
- **PR1 + PR2 zajedno ili sekvencijalno?** Odvojeno je sigurnije za launch; zajedno štedi jedan regresijski krug.
