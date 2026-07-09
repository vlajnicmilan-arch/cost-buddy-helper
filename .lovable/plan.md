# Analiza stanja Krug modula

**Napomena:** Ovo je analiza-samo. Nema koda, nema promjena. Sve tvrdnje su verificirane iz koda, migracija, RLS-a, RPC-a i produkcijske baze.

**Produkcijska stvarnost (baza upravo sad):** 1 aktivni Krug, 1 obrisan, 3 membershipa, 2 ownershipa, 2 shared izvora, **0 troškova u ijednom Krugu**, 0 pending, 0 potvrđenih, 0 dedup zapisa. Modul u produkciji **nitko još nije koristio end-to-end**.

---

## 1) Što je odrađeno i radi

### End-to-end (UI + DB + RLS)
| Funkcionalnost | Status | Datoteke |
|---|---|---|
| Kreiranje Kruga (naziv + preset) | ✅ | `CreateKrugDialog.tsx`, RLS `krug_insert_authenticated`, trigger `krug_bootstrap_creator` |
| Auto-bootstrap ownership+membership creatora | ✅ | `krug_bootstrap_creator()` PL/pgSQL trigger |
| Popis Krugova + detail screen | ✅ | `KrugListScreen.tsx`, `KrugDetailScreen.tsx`, `useMyKrugs`/`useKrug` |
| Dodavanje **postojećih** korisnika (email lookup) | ✅ | `AddKrugMemberDialog.tsx` → edge `krug-add-member` (service-role `find_user_by_email`) |
| Promocija/democija/uklanjanje članova | ✅ | RLS `krug_membership_update_owner`/`_delete_owner_not_self` + hook `useKrugMemberMutations` |
| Cap na `punopravni` po presetu | ✅ | Trigger `krug_enforce_punopravni_cap` + UI guard `canAddPunopravni` |
| Attach/detach zajedničkih izvora plaćanja | ✅ (djelomično, v. §4) | `KrugSharedSourcesSection.tsx`, RLS `krug_sps_*`, helper `krug_can_manage_shared_source` |
| Governance RPC-ovi (T7 privacy + T8 A1/A2/A3/A4/A5/A7) | ✅ | `krug_set_privacy`, `krug_apply_act`, `krug_withdraw`, `krug_retract`, `krug_govern_to_personal` |
| Idempotencija po `client_request_id` | ✅ | Tablica `krug_act_dedup` + hooks šalju `crypto.randomUUID()` |
| Approval queue "Za odlučivanje" | ✅ | `KrugApprovalQueue.tsx` + `useKrugPendingExpenses` — RLS-driven, quick action A1/A2 |
| Brisanje Kruga (solo + multi vote) | ✅ | `KrugDeleteDialog`, `KrugDeletionVotePanel`, RPC `krug_request_deletion`/`_vote_deletion`/`_cancel_deletion` |
| Soft-delete + 30d hard purge cron | ✅ | Edge `cleanup-krug-deleted`, RPC `krug_purge_deleted` |
| RLS na `expenses` za Krug vidljivost | ✅ | Policy `krug_select_visibility` (member ∧ (shared ∨ (personal ∧ can_see_personal))) |
| Feature gating (Pro tier) | ✅ | `useFeatureAccess`: `krug: 'pro'`, `useModuleStates`, BottomNav gating |
| i18n (HR/EN/DE) | ✅ | 25 top-level ključeva potpuno prevedeni; 12 whitelistanih (brand ime, iste riječi) |
| Pure decision helperi + testovi | ✅ | `krugDecisions.ts` (89 testova), `krugPresets.ts` (8), `krugDeletionDecisions.ts` (20) = **117 testova** |
| Hard-delete korisnika kompatibilnost | ✅ | `purgeUser.ts` blokira brisanje ako Krug ima druge članove |
| MCP tools (AI asistent) | ✅ | `list-krugs`, `get-krug-summary`, `list-krug-expenses` |

---

## 2) Što čeka na rad / nedovršeno

| Stavka | Što nedostaje | Opseg |
|---|---|---|
| **Ulazna točka za "trošak u Krugu"** | `AddExpense`/`AddIncome`/`useExpenseCRUD` NIGDJE ne postavlja `krug_id`. `KrugTransactionPanel` se renderira samo ako expense **već ima** `krug_id` — što se u produkciji nikad ne dogodi. Cijeli approval flow je **nedostupan** iz UI-a. | **VELIK** — zahtjeva izbor: (a) picker Kruga u AddExpense, ili (b) auto-propagate `krug_id` triggerom kad se koristi shared payment source |
| Auto-propagate `krug_id` iz `krug_shared_payment_source` | Nema trigera na `expenses` koji bi na osnovu `payment_source_id` naslijedio `krug_id`. Provjerio pg_trigger: 0 krug-triggera na expenses. | SREDNJI |
| Notifikacije | 0 edge funkcija (`notify-krug-*`), 0 push, 0 email. Owner ne zna da netko predlaže trošak. Ostali članovi ne znaju za `potvrdjena/nepotvrdjena` ishode. | SREDNJI |
| Realtime | Svjesno izostavljen iz rollouta — 0 kanala. Queue se osvježava samo na refetch (staleTime 60s). Bez pushad, viewer ne vidi promjenu queue-a. | SREDNJI |
| Email invitation za **nove** korisnike | `krug-add-member` explicitno vraća `user_not_found` za neregistrirane. `AddKrugMemberDialog` u UI-u kaže "pozivi novim korisnicima dolaze u sljedećem valu". | SREDNJI |
| Settlement / split / "tko duguje kome" | 0 helpera, 0 UI-a, 0 RPC-a. Family modul (uklonjen 8.6.2026) imao je `familySettlements.ts`, `familyForecastContrib.ts`, `familySplit*.ts` — **NIŠTA nije preneseno** u Krug. | VELIK |
| Lifecycle transitions | Enumi `early_signal/ugrozen/continuity_window/read_only` postoje u DB-u i i18n-u, ali **nema funkcije/cron-a** koji ih pomiče. Svi krugovi su `active` dok se ručno ne promijene. | SREDNJI |
| Auto-expiry `predlozena` (48h) | Funkcija `krug_expire_predlozena()` postoji u DB-u, ali **nema pg_cron scheduled joba** za nju. Wave 1.5 komentar u `useKrugAct.ts` eksplicitno priznaje ovaj gap. | MALI (samo cron unos) |
| Audit trail UI | Tablica `krug_act_dedup` bilježi ishode, ali nema UI-a za povijest odluka (tko je što potvrdio/negirao, kad). | SREDNJI |
| Built-in payment source attach | `KrugSharedSourcesSection` u UI-u nudi samo `custom:UUID` izvore; backend RLS/helper dopušta i built-in slugove, ali UI ih ne izlaže. | MALI |
| Preseti `putovanje/projekt/klub` | DB enum ima 6 preseta, UI izlaže samo 3 (`partner/su_roditelj/cimer`). Nedostaju capovi, ikone, copy. | MALI |
| Copy button za invite link | Nema; korisnik mora ručno diktirati email osobi izvan aplikacije. | MALI |
| Empty state / dijelove akcija koji rade `window.confirm()` | `handleRemove`, `unlinkPaymentSource` koriste native `window.confirm` umjesto shadcn `AlertDialog` — nekonzistentno s ostatkom aplikacije. | MALI |

---

## 3) Dobre strane

- **RLS pokrivenost potpuna.** Svih 6 Krug tablica ima INSERT/SELECT/UPDATE/DELETE policy prema semantici (owner/member/full member), koristi se `SECURITY DEFINER` helperi (`krug_is_member`, `krug_is_owner`, `krug_is_full_member`, `krug_can_manage_shared_source`, `krug_can_see_personal`) → **nema infinite recursion rizika**.
- **Atomarnost.** Sve mutacije koje mogu imati race (privacy switch, A1-A7, glasanje, brisanje) idu kroz `SECURITY DEFINER` RPC-e s idempotencijom preko `client_request_id`. Klijent ne piše direktno u statusne enume.
- **Pure decision helperi = SSOT.** `krugDecisions.ts` i `krugDeletionDecisions.ts` zrcale točno SQL RPC ishode. 117 vitest testova čuva regresiju. Filozofija "SQL i helperi MORAJU se podudarati" eksplicitno zapisana u komentarima.
- **Konzistentnost s ostatkom aplikacije.** Koristi iste primitive: TanStack Query (staleTime 5min), `showSuccess/showError`, `clickableProps`, `KrugLifecycleBadge` = varijanta shadcn Badge, `text-module`/`text-module-muted` tokeni (modularni identitet), `useUserProfiles` za display name, brand color HSL 25 95% 53% (narančasta).
- **Solid data model.** Sve FK NOT NULL gdje treba, `deleted_at` na kruzima (soft-delete iz UI-a filtriran), owner odvojen od membership enuma (`krug_ownership` tablica) → sprječava "owner has role X" ambigviju.
- **Testovi za rubne slučajeve deletion flow-a:** 20 testova pokriva solo/multi/all-approved/reject/cancel/notEligible.
- **MCP integracija.** AI asistent može čitati krugove — `list-krugs`, `get-krug-summary`, `list-krug-expenses`.

---

## 4) Loše strane / rizici

### Kritični (blokiraju monetizaciju)
1. **"Mrtvo more" — nema kako trošak uđe u Krug.** `expenses.krug_id` je nullable, ali u frontendu **nijedan CRUD put ga ne popunjava** (`useExpenseCRUD.ts`: 0 spomena). Bez ovoga: 0 kandidata za approval queue, 0 governance akcija, cijeli backend leži neaktivan. Vlasnik Pro pretplate otvara Krug → vidi članove i zajednički izvor → dodaje trošak kroz normalni AddExpense → trošak **nema** `krug_id` → ne pojavi se nigdje u Krug UI-u. Ovo je nedvosmislen kill-switch za launch.
2. **Bez notifikacija.** Owner neće znati da je nešto predloženo dok ručno ne otvori Krug. Bez push/email pipeline-a (`send-daily-summary`, `flush-participant-digest`, `send-push` — 0 spomena Kruga), approval flow je async ali bez signalizacije = zaboravlja se.
3. **Neisproban u produkciji.** 0 troškova u ijednom kruzi. Path A1→A2→A3→A4→A5 nikad nije prošao produkcijskim putem, samo unit testovima helpera. Prvi paying user je i prvi tester.

### Sigurnost — nije rupa, ali za znati
- `krug_deletion_request.status` je `text` s default `'pending'`, ne enum → moguće corruption ako RPC promijeni format (trenutno nije problem jer se piše samo kroz RPC-e).
- `find_user_by_email` u `krug-add-member` je enumeracijski vektor: bilo koji ulogirani korisnik može provjeriti da li neki email postoji u sustavu preko odgovora `user_not_found` vs `already_member`/`ok`. To je poznati kompromis (isti u budget/project invite), ne novi rizik za Krug.

### UX rupe
- `window.confirm()` u `handleRemove` (KrugDetailScreen) i `unlinkPaymentSource` (KrugSharedSourcesSection) — native browser dialog, ne shadcn `AlertDialog`. Nekonzistentno.
- `KrugListScreen` prikazuje ime u hardkodiranoj boji `text-[hsl(25_95%_53%)]` umjesto module tokena — dvostruko definiran brand color.
- `KrugApprovalQueue`: klik na red otvara `TransactionDetailDialog` u kojem `onEdit` NE radi ništa (komentar: "edit ostaje izvan queue surfacea u v1") → korisnik očekuje edit, dobije nema-akcije.
- Detail screen nema empty state za "nema zajedničkih izvora" ako owner još nije attachao (samo tekst; nema CTA prema attach dropdownu).
- Bez realtime, dva člana na istom Krugu ne vide međusobne akcije bez refresh-a.

### Nedovršena povlašćenost
- `punopravni` cap enforcan na UI-u (`canAddPunopravni`) **i** na triggeru (`krug_enforce_punopravni_cap`) — dobro. Ali cap se ne provjerava kod **promocije** kroz `krug_membership_update_owner` RLS direktno; provjeri li ga trigger? Nije verificirano u ovom skenu — vrijedno provjere.
- Preset `su_roditelj` = 2 punopravna. Ako se roditelj razvede i uvede novog partnera, preset "zaključan zauvijek" (Krug Foundation invarijanta) → korisnik mora obrisati i kreirati novi Krug. Nema copy-a koji to objašnjava.

### Dugovi
- `KrugTransactionPanel` (359 linija) drži cijelu decision-matricu inline; teško za razumjeti kad se vraćaš nakon 3 mjeseca. Ekstrakcija u sub-komponente po fazi (privacy chip / act buttons / danger zone) bi pomogla.
- Family modul obrisan 8.6.2026 ali `payment_source_members` tablica ostala — komentar priznaje da se koristi kroz Shared Wallet UI, no odnos prema Krug shared sources nije formalno riješen. Postoji rizik dvostrukog dijeljenja istog izvora kroz oba mehanizma.

---

## 5) Ocjena zrelosti: **4/10**

**Obrazloženje:** Backend (RPC, RLS, triggeri, dedup, soft-delete, cron za purge) je **7/10** — čist, testiran, konzistentan. Frontend skeleton (list/detail/create/members/deletion) je **6/10** — funkcionalan ali s window.confirm i nekim UX rupama. **User journey** koji plaćajući korisnik očekuje ("dodajem trošak → obitelj vidi → potvrđuju → poravnamo se") je **1/10** — praktički ne postoji. Prosjek ponderiran spram "što korisnik dobije za novac" = 4/10.

### **Nije spreman za launch 28.8. kao naplatni modul.**

### TOP 3 stvari koje ga dijele od spremnosti

1. **Ulazak troška u Krug flow.** Bez integracije `krug_id` u `useExpenseCRUD` (i/ili trigera koji propagira iz `krug_shared_payment_source.payment_source_id → expenses.krug_id`) modul je vizualno prazan. To je conditio sine qua non. **Veliki opseg — 3-5 dana.**

2. **Notifikacija owneru na `predlozena` + članovima na `potvrdjena/nepotvrdjena`.** Bez ovoga, async approval flow gubi smisao. Minimalno: edge fn `notify-krug-transaction` sličan `notify-project-transaction` + hook u SQL RPC-u `krug_set_privacy` (ok_proposed_shared) i `krug_apply_act` (ok_confirmed/ok_negated). Postoje već postojeći uzorci `notify-project-transaction`, `notify-note-added` — copy-paste posao. **Srednji opseg — 2-3 dana.**

3. **Settlement / split view.** Korisnik koji plaća za "zajednički kontekst" prvo pita: "koliko mi svaki od njih duguje?". Ne postoji ni RPC, ni komponenta. Family imao je proporcionalni split — nije prenesen. Minimalno za launch: jednostavni "svi jednako" balance po Krugu s tablicom "X duguje Y-u Z EUR" ispod zajedničkih izvora. **Veliki opseg — 4-6 dana, i to samo "svi jednako".**

### Sekundarno (može poslije launcha)
Email invite za neregistrirane, realtime kanal za queue, audit history UI, expire `predlozena` cron, lifecycle transition automatika, built-in izvori u shared list, preseti 4-6.

### Preporuka
Ako je 28.8. fiksan, **pomakni Krug iz Pro tier-a u free preview** ("beta, bez naknade") do prve punkcije 1-2-3. Alternativno: pomakni launch Kruga za 4-6 tjedana i ostale module (koji su zreliji) drži kao naplatnu okosnicu.

---

**Izvori:** `src/hooks/useKrug*.ts` (9 datoteka, 793 linija), `src/components/krug/` (11 komponenti), `src/lib/krug*.ts` (5 pure fileova), 13 SQL migracija, 6 Krug tablica + 20 RPC-a/trigger funkcija, 12 RLS policy, edge fn `krug-add-member` + `cleanup-krug-deleted`, i18n × 3 jezika. Produkcijska baza sondirana `2026-07-09`.