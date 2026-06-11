# V&M Balance — Communication Taxonomy v1

Status: radni standard (v1). Polazi od zamrznutog `Tone Principle V2` i zatvorenog `Communication Inventory` (13 primjera).

Svrha: za bilo koji event u appu dati jednoznačan odgovor — koji surface, koji severity, koji registar, kako routati, kako spojiti s drugim surface-ima. Ovo nije tone dokument; *kako zvučati* ostaje u V2, *što kada izabrati* je ovdje.

Inventory reference: I1–I13 (Daily Summary Push, Project Activity Push, Loss Zone Alert, AI Insight Card, Budget Breach Push+Avatar, Trial Banner, StatusFeedback, Offline Banner, Krug Deletion Vote, Reports Empty State, Upgrade Surfaces, Reset Password, Project Delete Dialog).

---

## §0. Kako se koristi — Decision flow

Za svaki novi (ili izmijenjeni) komunikacijski surface, prođi 5 koraka po redu. Ako neki korak ne možeš ispuniti, surface nije spreman za PR.

1. **Identificiraj event class** (§1). Ako klasa ne postoji, ne izmišljaj je — otvori PR za §1 s file:line referencom.
2. **Odredi severity** (§2): info / warning / blocking. Severity je *neovisna* od registra.
3. **Izaberi surface** prema matrici §4. Ako matrica daje 0 ili >1 primarni surface, surface odabir nije gotov — nije dopušteno "kombinirati".
4. **Primijeni registar** prema §5 i vokabular iz Tone Principle V2. Provjeri obavezna polja iz §6 (atribucija + deep-link) ako klasa to zahtijeva.
5. **Provjeri kolizije** (§7): ako u istom prozoru (≤5 min, isti user) okida još jedan surface za isti ili povezan event — primijeni dedupe pravilo. Za destructive akcije primijeni §8.

Ako je event empty-state → dodatno prođi §9. Prije PR-a usporedi s §10 anti-pattern listom.

---

## §1. Event class — zatvorena lista

Klase su izvedene 1:1 iz inventara. Nova klasa zahtijeva file:line referencu na stvarni surface.

| ID | Klasa | Opis | Inventory |
|----|-------|------|-----------|
| E1 | system-state | Stanje sustava neovisno o korisničkoj akciji (mreža, sync, app lifecycle) | I8 |
| E2 | user-action-feedback | Trenutna potvrda/odbijanje korisničke akcije | I7 |
| E3 | financial-alert | Financijski signal koji traži pažnju (budget breach, loss zone, gubitak novca) | I3, I4, I5 |
| E4 | project-activity | Aktivnost drugog člana u dijeljenom prostoru (projekt, krug, family) | I1, I2 |
| E5 | entitlement | Pristup/plan/quota (Pro/Business, downgrade, trial) | I6, I11 |
| E6 | destructive-confirm | Korisnik pokreće brisanje/uklanjanje koje nije trivijalno reverzibilno | I13 |
| E7 | empty-state | Surface koji bi prikazivao podatke, ali ih nema | I10 |
| E8 | transactional-auth | Diskretna auth/identity tranzakcija (reset, verify, OAuth callback) | I12 |
| E9 | governance-vote | Kolektivna odluka s formalnim ishodom (Krug vote, family approval) | I9 |

---

## §2. Severity — neovisna os

| Razina | Definicija | Posljedica za surface |
|--------|------------|-----------------------|
| info | Korisnik *može* htjeti znati. Nepostupanje nema posljedicu. | Tihi surface (chip/inline/empty/status-feedback). Bez push-a. |
| warning | Postoji posljedica ako se ignorira, ali nije trenutna. | Vidljiv surface (banner/notif/card). Push samo ako klasa to dopušta. |
| blocking | Korisnik ne može nastaviti dok ne odluči, ili gubi pristup/podatak ako ne reagira. | Modal/full-screen/alert-dialog. Mora imati eksplicitnu akciju. |

Severity nije sinonim s registrom V2. Vidi I5 (warning registar primijenjen na info severity event) i I6 (warning surface za blocking-class entitlement event) u §10.

---

## §3. Surface katalog + limiti

Zatvoren popis. Novi surface = PR + odluka, ne ad-hoc.

| ID | Surface | Title limit | Body limit | CTA | Dopušten registar | Inventory |
|----|---------|-------------|------------|-----|-------------------|-----------|
| S1 | push notification | ≤40 znakova | ≤120 znakova | 1 implicitna (deep-link) | informativni, interpersonalni | I1, I2, I5 |
| S2 | in-app notification (zvonce) | ≤60 znakova | ≤140 znakova | 1 deep-link | informativni, interpersonalni, upozoravajući | I2, I5 |
| S3 | banner (top/inline) | ≤50 znakova | ≤100 znakova | 0–1 | informativni, upozoravajući | I8, I11 |
| S4 | card (dashboard) | ≤40 znakova | ≤180 znakova | 0–2 | informativni, upozoravajući | I3, I4 |
| S5 | chip / pill | n/a | ≤24 znaka | 1 (klikom) | informativni | I11 |
| S6 | alert-dialog / modal | ≤40 znakova | ≤200 znakova | 2–3 (uvijek Odustani) | po klasi (vidi §5) | I9, I13 |
| S7 | full-screen state | ≤40 znakova | ≤140 znakova | 1 (auto-redirect preferiran) | informativni | I12 |
| S8 | status-feedback overlay | n/a | ≤4 riječi | 0 | mikro-feedback (V2) | I7 |
| S9 | inline empty state | ≤32 znaka | ≤100 znakova | 0–1 (CTA = "stvori prvi…") | informativni | I10 |

Pravilo: limiti se enforce-aju u review-u, ne runtime-om. Prekoračenje je dopušteno samo s eksplicitnim opravdanjem u PR opisu i samo za S6 (vidi §8).

---

## §4. Matrica — Event × Severity → Surface (SRCE DOKUMENTA)

Ćelija = primarni surface (mora postojati) + opcionalni sekundarni (smije postojati). "—" = kombinacija nije dopuštena bez PR-a.

| Event \ Severity | info | warning | blocking |
|---|---|---|---|
| E1 system-state | — | **S3** banner | S6 modal (rijetko) |
| E2 user-action-feedback | **S8** status-feedback | S8 + S2 (ako traje) | — |
| E3 financial-alert | **S4** card | **S4** card + S2 notif | S6 modal |
| E4 project-activity | **S2** notif | S2 notif + S1 push | — |
| E5 entitlement | **S5** chip | **S3** banner | **S6** modal (paywall) |
| E6 destructive-confirm | — | — | **S6** alert-dialog (§8) |
| E7 empty-state | **S9** inline | — | — |
| E8 transactional-auth | — | **S7** full-screen | S7 + redirect |
| E9 governance-vote | S2 notif | **S6** modal (vote) | S6 + S2 ishod |

Pravila uz matricu:

- Push (S1) je dopušten samo za E4 i E3-warning. Nikad za E1, E2, E7, E8 — bez iznimke.
- Banner (S3) i card (S4) za isti event istovremeno = kolizija (§7).
- Ako event prelazi severity prag (info → warning, npr. budget threshold), surface se *zamjenjuje*, ne dodaje.

---

## §5. Registar po klasi — most prema V2

| Klasa | Dominantni registar (V2) | Miješanje dopušteno? |
|-------|--------------------------|----------------------|
| E1 system-state | informativni | Ne. |
| E2 user-action-feedback | mikro-feedback | Ne. |
| E3 financial-alert | upozoravajući (warning/blocking), informativni (info) | Ne — registar prati severity. |
| E4 project-activity | interpersonalni | Ne. Atribucija obavezna (§6). |
| E5 entitlement | informativni (chip), upozoravajući (banner/modal) | Ne. |
| E6 destructive-confirm | upozoravajući naslov + informativni opis | **Da** — jedini dopušteni mix. Vidi §8. |
| E7 empty-state | informativni | Ne. |
| E8 transactional-auth | informativni | Ne — "ne dramatiziraj očekivano" (V2). |
| E9 governance-vote | interpersonalni | Ne. Ishod modali smiju biti informativni. |

Vokabular i ton dolaze iz V2. Ovdje je samo *koji* registar za *koju* klasu.

---

## §6. Attribution & deep-link obveze

Vrijedi samo za klase gdje krivi subject ili tab-routing aktivno štete.

| Klasa | Verificirani actor (ime + provjera) | Deep-link obavezan |
|-------|-------------------------------------|--------------------|
| E4 project-activity | **Da.** Subject mora biti stvarni autor zapisa (ne pretpostavljen). | **Da** — na konkretan log/milestone, ne na tab. |
| E9 governance-vote | **Da.** | **Da** — na vote panel, ne na Krug landing. |
| E3 financial-alert | n/a (system actor) | **Da** — na konkretni budget/projekt, ne na Reports. |
| Sve ostale | Ne primjenjuje se. | Ne primjenjuje se. |

Bez ispunjenog ovog odjeljka, surface za navedene klase ne smije proći PR. Inventory bug I2 (krivi subject + tab routing) je primarni razlog postojanja ovog odjeljka.

---

## §7. Dedupe / collision pravila

Definicija "isti prozor": isti user, ≤5 min, isti `dedup_key` ili isti `(project_id, event_class)`.

Prioritet kad se dva surface-a takmiče za istog korisnika u istom prozoru:

```
blocking > warning > info
S6 > S3/S4 > S2 > S1 > S5/S8/S9
```

Pravila:

1. **Jedan event = jedan dominantni surface po ekranu u zadanom prozoru.** Niži se ne emitira ili se gasi.
2. Push (S1) za event koji već ima aktivan S2/S3/S4 na otvorenoj sesiji se *ne* šalje (in-session suppression).
3. Za E3: budget breach push + dashboard avatar event istovremeno (I5) → push pobjeđuje, avatar event se odgađa za sljedeću sesiju.
4. Za E4: digest (I1) i activity push (I2) za isti `project_id` u istom danu → digest preuzima, instant push se gasi (već implementirano — Taxonomy samo kodificira politiku).
5. `dedup_key` u `notifications` tablici je tehnička osnova; politika prioriteta se odlučuje *prije* upisa.

---

## §8. Destructive confirm — obrazac

Referenca: `ProjectDeleteDialog.tsx` (I13).

Obavezna struktura S6 alert-dialoga za E6:

```
Title:       Pitanje, jedna rečenica.            ["Obrisati projekt?"]
Description: Posljedica + safety net.            ["…ide u Otpad i čuva se 30 dana…"]
Actions:     [Odustani]  [Safe path]  [Destructive]
             ghost       outline      destructive
             lijevo      sredina      desno
```

Pravila:

- "Trajno" u copy-u **samo** ako je akcija doslovno trajna. Inače: "obriši", "ukloni", "premjesti u Otpad".
- Safe path (npr. arhiva) je dopušten samo ako postoji u domeni. Ne izmišljaj ga radi simetrije.
- Mješoviti registar (warning title + informativni opis) je dopušten samo ovdje.
- Body smije premašiti S6 limit od 200 znakova *samo* ako safety net zahtijeva eksplicitan rok (npr. "30 dana").

---

## §9. Empty state — pod-tipovi

Referenca: I10 (Reports `noResults`/`noTransactions`/`noExpenses`/…).

| Pod-tip | Kada | CTA očekivanje |
|---------|------|----------------|
| first-run | Korisnik nikad nije imao podatke u ovom prostoru | **CTA obavezna** ("Dodaj prvu transakciju") |
| filtered | Filteri isključuju sve postojeće | CTA = "Resetiraj filtere", ne "Dodaj…" |
| permission-gated | Korisnik nema pristup (npr. viewer) | Bez CTA. Tekst objašnjava razlog. |
| error-fallback | Fetch je pao | CTA = "Pokušaj ponovno". Ne miješati s "nemaš podatke". |

Pravilo: jedan i18n ključ po pod-tipu po domeni. Konsolidacija postojećih ključeva ide kroz PR, ne dio ovog dokumenta.

---

## §10. Anti-pattern katalog (iz inventara)

Konkretne pogreške koje su već u kodu. Svaka ima file:line. Nove stavke ulaze samo s file:line referencom.

| # | Anti-pattern | Lokacija | Klasa pravila prekršena |
|---|--------------|----------|-------------------------|
| A1 | Krivi subject u push poruci (atribucija nije verificirana) | `supabase/functions/notify-project-activity/index.ts` (buildText) | §6 attribution |
| A2 | Push deep-link vodi na tab umjesto na konkretni resource | `useNotificationNavigation.ts` (project_activity branch) | §6 deep-link |
| A3 | Severity ≠ registar: warning copy za info-severity loss zone | `issueDetection.ts` + AI Insight card | §2 + §5 |
| A4 | Isti event u dva surface-a u 200ms (budget breach push + avatar event) | `check-budget-alerts/index.ts` + `AIInsightBubble.tsx` | §7 kolizija |
| A5 | Premature warning bez eksplicitne posljedice (Trial Banner) | `TrialBanner.tsx` | §2 severity + V2 "konkretno" |
| A6 | StatusFeedback ne forsira ≤4 riječi | `useStatusFeedback.ts` pozivatelji | §3 S8 limit |
| A7 | 3 različita surface-a za istu entitlement klasu bez prioriteta | `UpgradePrompt.tsx` + `TrialFeatureChip.tsx` + `ProjectReadOnlyBanner.tsx` | §4 matrica + §7 |
| A8 | 5 i18n ključeva za isti empty-state pod-tip | `hr.json` (`noResults`, `noTransactions`, `noExpenses`, `noIncome`, `noExpensesInCategory`) | §9 |
| A9 | "Obriši trajno" copy za soft-delete u Trash | `ProjectDeleteDialog.tsx` (deleteAction key) | §8 terminologija |
| A10 | Governance ishod miješa sustav i interpersonal ("not_eligible" zvuči kao API error) | `KrugDeletionVotePanel.tsx` + i18n | §5 E9 |
| A11 | Auth uspjeh ne radi auto-redirect, CTA vodi na `/auth` | `ResetPassword.tsx` | §4 E8 + V2 "ne dramatiziraj očekivano" |

---

## §11. Governance

Verzija je v1, frozen kao i Tone Principle V2. Izmjene §1 (event class), §3 (surface katalog) i §4 (matrica) idu kroz PR + memory update. Anti-pattern lista (§10) raste organski s file:line referencama.

---

*Kraj v1.*
