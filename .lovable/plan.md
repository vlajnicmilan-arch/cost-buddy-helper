## 1. Zatečeno stanje (potvrđeno DB queryjem, ne pretpostavka)

**Stari split sloj = MRTAV KOD.**
- `to_regclass('public.family_groups')` → NULL
- `to_regclass('public.family_split_snapshots')` → NULL
- `to_regclass('public.family_shared_sources')` → NULL (implicitno; memory `family-module-removed` 8.6.2026 potvrđuje da je 13 `family_*` tablica dropanо CASCADE)

**Ali funkcije još stoje kao zombie u `pg_proc`:**
- `refresh_family_split_snapshot(uuid, date, date)` — pun tijelo referencira `family_groups`, `family_shared_sources`, `family_split_snapshots`, `is_family_member`, `compute_family_income_ratio`. Pri pozivu bi eksplodirala na "relation does not exist". Nitko je ne zove (`rg` u `src/` = 0 pogodaka izvan `types.ts`).
- `apply_split_override(uuid, jsonb)` — ista klasa, isto mrtvo.

`family_groups` NIJE isto što i `krug`. To je zaseban stariji entitet koji je Krug **zamijenio**, nije rename. Krug model je built from scratch:
- Tablice: `krug`, `krug_membership` (role: `punopravni|obicni`), `krug_ownership`, `krug_shared_payment_source`
- Expenses vezuje `krug_id`, `krug_privacy` ('shared'|'personal'), `krug_shared_status` ('predlozena'|'potvrdjena'|'nepotvrdjena')
- **Nijedna Krug funkcija ne piše split/settlement.** `krug_*` funkcije pokrivaju act flow (predlozena→potvrdjena), share/unshare, deletion voting, ali NE "tko kome duguje".

**Zaključak:** za settlement u Krug modelu **gradimo od nule**. Nema most-a stari→novi jer stara implementacija nikad nije radila nad krug tablicama, a njeni referentni objekti su obrisani.

## 2. Što settlement treba izračunati (semantika)

Ulazni skup: `expenses WHERE krug_id=? AND krug_privacy='shared' AND krug_shared_status='potvrdjena' AND deleted_at IS NULL AND type='expense' AND date IN [period]`.

Za svaki trošak:
- **Platio** = vlasnik payment sourcea (za `custom:UUID` → owner iz `custom_payment_sources`, koji je najčešće `expenses.user_id` osim kod shared source-a gdje treba resolve). Rubni slučaj: shared source — payer je `expenses.user_id` (tko je zaveo), NE svi članovi.
- **Duguje po članu** = amount × udio. Udio dolazi iz split moda:
  - `equal` — 1/N (gdje je N = broj `punopravni` članova + owner)
  - `proportional_income` — omjer iz income split governance (već postoji infrastruktura; treba potvrditi radi li per-Krug ili per-source)
  - `manual` — fallback = equal (kao u starom kodu)
  - Per-transakciju override → `expenses.split_overrides` jsonb (kolona više NE POSTOJI — obrisana u family cleanupu, provjeriti; ako je stvarno maknuta, override je Faza 2 feature)

Po članu: `net_owed[u] = SUM(owed[u]) − SUM(paid[u])`. Negativan = duguje mu se, pozitivan = duguje.

**Netiranje (za JEDNOSTAVNU razinu):** greedy pair matching — sortiraj po netu, spoji najvećeg dužnika s najvećim vjerovnikom, ponavljaj. Za N članova daje ≤N−1 transfera (matematički minimum je NP-hard u općem slučaju, greedy je industry standard za Splitwise-tip apps).

**Valute:** Krug nema `currency` polje (za razliku od starog `family_groups.currency`). Ili nasljedstvo od shared sourcea, ili prisiliti single-currency per Krug. **Odluka za Milana.**

## 3. Ovisnosti i rizici

- **Balance engine: NULA dodira** ako je settlement čista read-only agregacija. "Označi podmireno" (Srednja razina) NE smije stvarati expense zapis — to je zaseban `krug_settlement_ledger`, izvan `expenses` write puta. Time izbjegavamo cijelu balance regression policy (`.lovable/memory/features/balance-regression-testing-policy`).
- **RLS:** settlement view čita `expenses` kroz postojeći `krug_is_full_member` gate — bez novih RLS grana. Novi ledger dobiva vlastite policy-e (svi članovi Kruga read; write kroz RPC).
- **Income split governance (4 moda)** — treba potvrditi gdje je konfiguriran (per user? per source? per Krug?). Ako nije per-Krug, dodati `krug.split_mode` kolonu.
- **Deletion:** obrisati mrtve funkcije `refresh_family_split_snapshot` i `apply_split_override` (nezavisan cleanup PR, ne blokira settlement).

## 4. Tri razine opsega

### A) JEDNOSTAVNO — Read-only "tko kome koliko"

**Deliverables:**
- Migracija: dodati `krug.split_mode enum('equal','proportional_income','manual') NOT NULL DEFAULT 'equal'` + `krug.settlement_currency text` (ili odustati od multi-currency za V1)
- RPC: `krug_settlement_preview(p_krug_id uuid, p_period_start date, p_period_end date) RETURNS TABLE(...)` — SECURITY DEFINER, gate na `krug_is_full_member`, vraća per-member `paid/owed/net` + izračunatu listu transfera (netirano greedy)
- Frontend: `src/components/krug/KrugSettlementSection.tsx` + hook `useKrugSettlement`, plugin u `KrugDetailScreen`
- i18n: `krug.settlement.*` u hr/en/de
- Testovi: vitest za greedy netting helper (`src/lib/krugSettlement.ts`) + SQL smoke za RPC

**Rad:** ~1 migracija, ~1 RPC, ~2 komponente, ~1 hook, ~1 helper + testovi. Grubo **1–1.5 dana**.
**Rizik:** nizak. Zero write, zero balance engine dodira.

### B) SREDNJE — A + "označi podmireno" + povijest

**Dodatno na A:**
- Migracija: `krug_settlement_ledger(id, krug_id, period_start, period_end, from_user, to_user, amount, currency, status enum('pending','settled','void'), settled_at, settled_by, note)` + GRANT + RLS (full members read; RPC-only write)
- RPC: `krug_settlement_mark_settled(p_transfer_id, p_note)`, `krug_settlement_void(p_transfer_id)`, `krug_settlement_snapshot(p_krug_id, p_period_*)` (persista current preview kao "period X zaključan")
- Idempotencija: unique (krug_id, period_start, period_end, from_user, to_user) za snapshot
- Frontend: povijest tab, "Podmiri" gumb per-red, potvrdni dijalog
- Push notif: obavijest primatelju kad se transfer označi settled (opcionalno)

**Rad:** +1 migracija, +3 RPC-a, +2-3 komponente, notifikacija granica. Grubo **+1.5–2 dana** iznad A.
**Rizik:** srednji. Concurrency oko dvostrukog "settled" clicka (rješivo unique + FOR UPDATE). Zabuna korisnika oko "što ako se doda novi trošak nakon snapshota" — treba UX pravilo (snapshot je immutable, novi troškovi ulaze u novi period).

### C) PUNO — B + podsjetnici + auto-periodični + multi-currency

**Dodatno na B:**
- Cron job (pg_cron) za mjesečni auto-snapshot na kraju perioda
- `notification_preferences` polje za settlement reminders (weekly digest tipa "imaš 3 nepodmirene stavke")
- FX konverzija kad Krug ima miješane valute po shared sourceima — ECB rates snapshot per period
- Export (PDF/CSV) settlement izvještaja

**Rad:** +1 cron migracija, +1 edge fn (reminder digest), FX konverzija je netrivijalna (koji rate? snapshot vs live?), PDF izvoz reuse `familySettlementPdf.ts`? **NE** — taj file je obrisan (memory family-module-removed). Novi PDF layout. Grubo **+3–4 dana** iznad B.
**Rizik:** visok. Multi-currency povlači decision oko rate freezinga; podsjetnici povlače notification_preferences UI; cron pada pod balance-invariants radare treba SQL invariant test.

## 5. Preporučeni tok (ako Milan potvrdi)

1. Odabir razine (A/B/C) i odluka o multi-currency (za V1 predlažem single-currency = valuta prvog shared sourcea)
2. Odluka o split_mode konfiguraciji (per-Krug polje ili nasljediti od postojećeg income governance)
3. Odvojen cleanup PR za brisanje mrtvih `refresh_family_split_snapshot` + `apply_split_override` funkcija (ne blokira settlement, ali čisti confusion)
4. Implementacija odabrane razine

## 6. Otvorena pitanja za Milana

- **Razina A, B ili C?**
- **Multi-currency u V1: da/ne?**
- **Split mod: fiksno equal u V1 ili odmah 3 moda (equal / proportional / manual)?**
- **Period definicija: kalendarski mjesec, custom raspon koji korisnik bira, ili "od zadnjeg settlementa"?**
- **"Označi podmireno" — smije li bilo koji `punopravni` član kliknuti, ili samo primatelj/pošiljatelj para?**
