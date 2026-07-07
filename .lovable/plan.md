
# Isplate radnicima — kritički osvrt + plan implementacije

## Dio 1 — Kritički osvrt (napadam dizajn)

### 1.1 Rubni slučajevi gradilišta koji ruše "B + lock"

- **Retroaktivna korekcija sati unutar isplaćenog perioda.** Radnik prijavi 8h, owner isplati, sutradan otkrije da je bilo 10h. Lock traži unlock cijelog payouta → risk: owner nesvjesno "otvori" period, zaboravi zatvoriti, sljedeći payout izračuna gross iz izmijenjenih sati **plus** doplati staru razliku → dvostruki cost. **Mitigacija:** unlock ne smije samo micati `payout_id`, mora reklasificirati entry kao "adjustment" (novo polje) i force-showati vlasniku "Δ = +2h × 25 = 50 EUR → dodaj u sljedeći payout ili napravi doplatu odmah". Bez toga UI dopušta tihu kontaminaciju.
- **Radnik na 2 projekta isti dan.** Model već rješava (`project_work_entries.project_id` + `worker_id` po projektu — worker je per-projekt entitet, ne globalni). Nije problem strukture, ali UI mora jasno pokazati "isplata je per projekt" — inače owner očekuje "isplati Ivicu za lipanj" globalno.
- **Promjena satnice usred perioda.** `hourly_rate_snapshot` na payoutu je nužan, ali **nedovoljan**: ako owner promijeni `project_workers.hourly_rate` 15. u mjesecu, entriji od 1–14 su bili "vrijedni" stare satnice, a mi ih sumiramo × nove. **Mitigacija v1 (jeftina):** preview split "1–14 @ old, 15–30 @ new" temeljen na `updated_at` project_workers-a je nepouzdan (edit se može dogoditi kasnije). Realno: **snapshotati rate NA `work_entries` u trenutku unosa** (dodati `rate_snapshot` na entry). Ovo je promjena scopea koju treba svjesno prihvatiti ili odbaciti.
- **Worker bez `user_id` linka (offline radnik).** RLS-om je nevidljiv sam sebi (nema računa) — OK. Ali: owner ga plaća gotovinom, `paid_amount` unese ručno, entriji postoje — sve radi. **Rizik:** kad se kasnije doda `user_id` link (radnik se registrira), povijesni payouti su vidljivi novom useru — treba potvrditi je li to željeno (vjerojatno DA — vidi svoju povijest). RLS SELECT na payoutima će to automatski pokriti.
- **Payout stvoren iz 0 sati (avansi bez odrađenog rada).** `gross = 0`, `paid > 0` → status "advance". Model to podnosi (paid > gross je legalno), ali UI mora imati poseban tok "avans" da ne zbunjuje.

### 1.2 Payout ↔ expense sinkronizacijski gap-ovi koje atomarna RPC NE zatvara

- **Direktan edit expensea van RPC-a.** Ako owner otvori transakciju u Walletu i promijeni iznos ili obriše je "hard", payout ostaje s krivim `paid_amount` i `expense_id` visećim. **Mitigacija:** trigger na `expenses` — ako `worker_payout_id IS NOT NULL` → blokiraj UPDATE ključnih polja (amount, payment_source, event_at) i DELETE osim iz RPC-a (isti `SET LOCAL app.allow_payout_write` uzorak kao `set_source_anchor`).
- **Soft-delete expensea mimo RPC-a.** `deleted_at` set na expense, ali payout status ostaje "paid" → dashboard laže. **Isti trigger** mora blokirati soft-delete direktno; brisanje ide ISKLJUČIVO kroz `delete_worker_payout` RPC koji stornira oboje.
- **Bank matching na payout expense.** Bank sync može spariti bankovnu transakciju s payout expenseom (npr. isplata gotovine s računa). Trenutno bank matching update-a `payment_source`, `amount`, `event_at`. Ako je expense zaključan trigger blokira → bank matching puca. **Rješenje:** dopusti bank matching (whitelisted polja: `matched_transaction_id`, `bank_matched_at`) kroz allow-flag, ali `amount`/`payment_source` ostaju zaključani; ako se bank transakcija razlikuje po iznosu — signalizacija ownera, ne tihi update.
- **Storno payouta kada je expense već match-an na banku.** Bank match visi na obrisanoj transakciji. RPC mora unmatch-ati prije soft-delete-a.

### 1.3 Interakcija s balance engineom

- Payout expense **mora** ići kroz manual_entry intent s eksplicitnim `event_at = paid_at` (isti obrazac kao C2 u anchor kodu). U protivnom, isplata datuma "prošli mjesec" ali kreirana danas dobiva današnji `event_at` → saldo kroz vrijeme laže.
- **Anchored izvor:** ako je payment_source anchored i `paid_at < anchor_ts` → expense je "povijesni" i **ne smije** utjecati na stored balance (isti postojeći filter). To radi automatski, ALI storno/unlock scenariji: soft-delete povijesnog expensea ne pomiče saldo — OK. Unlock entrija ne dira expense — OK. **Rizik samo ako** promijenimo `paid_at` payouta post-hoc (npr. owner popravi datum) — treba ili zabraniti, ili proći kroz `set_source_anchor`-tipa RPC. **Preporuka v1:** `paid_at` immutable na payoutu; korekcija = storno + novi payout.
- **B9 guard trigger (Faza B balance saga) — bez konflikta.** Payout RPC piše standardnim manual intentom, ne dira anchor kolone. Nema preklapanja s `_prevent_direct_anchor_update`.

### 1.4 RLS preciznost — realni problem

Postojeći stanje (verificirano u migraciji `20260609034641_*`):
- `project_work_entries` SELECT policy nije eksplicitno postavljen u zadnjem sweepu → naslijeđen širi "project members can view" iz starijih migracija. **Radnik trenutno može vidjeti sve entrije projekta**, ne samo svoje. To je već curenje neovisno o payoutima.
- `project_workers` — sličan pattern; radnik vidi kolege (satnice + kontakte). Curi.

**Nužne izmjene:**
1. Restrictno-orjentiran SELECT rewrite na `project_work_entries`: owner sve, ostali samo `EXISTS (workers w WHERE w.id = worker_id AND w.user_id = auth.uid())`.
2. Isto na `project_workers`: owner sve, ne-owner samo `user_id = auth.uid()`.
3. Nova tablica `project_worker_payouts`: identičan pattern (owner sve; radnik samo payoute na `worker.user_id = auth.uid()`).
4. Novi lock-audit table (`project_work_entry_locks`): read-only za sve članove projekta (transparentnost), write samo kroz RPC.

**Napomena:** ove RLS izmjene imaju blast-radius izvan scopea payouta (mijenjaju što radnik vidi *danas*). Vlasnik ovo mora eksplicitno potvrditi — ne uvodimo tihi behavior change.

### 1.5 Što bih izbacio iz v1

- **Bulk "isplati sve radnike odjednom".** Zvuči zgodno, ali u praksi svaki radnik ima drugi period/iznos/gotovina-vs-transfer. Krećemo per-worker; bulk kasnije kad korisnik traži.
- **`rate_snapshot` na `work_entries`.** Overkill za v1 ako vlasnik ne mijenja rate često. Samo `hourly_rate_snapshot` na payoutu + upozorenje u UI-u ako je rate mijenjan unutar perioda ("Satnica je promijenjena 15.6. — preview koristi trenutnu vrijednost"). Prihvaćena tehnički dug, dokumentiran.
- **Preview po danima s checkboxima za isključenje (Varijanta C korak).** Za v1: samo period + edit iznosa. Isključenje dana radi se editiranjem `actual_hours` prije isplate.
- **Radničko "priznanje primitka" (dvostruki potpis).** Nije traženo.

### 1.6 Što NEDOSTAJE u vlasnikovom zahtjevu

- **Notifikacija radniku kad je payout kreiran.** Radnik s user_id linkom očekuje "Isplaćeno ti je 1200 EUR za lipanj". Bez toga radnik ne zna zašto je entry odjednom zaključan. Push kanal već postoji.
- **Izvještaj/export payouta (PDF/CSV).** Knjigovođa će tražiti. v1 može biti CSV export payout tablice po projektu — jeftino.
- **"Preostalo za isplatu" agregat na Dashboard/Projects listi.** Vlasnik je tražio da je centralna brojka po projektu — mora se vidjeti bez ulaska u detalj radnika. Dodati kolonu/badge na project cardu.

---

## Dio 2 — Plan implementacije (v1)

### 2.1 Podatkovni model

**Nova tablica `public.project_worker_payouts`:**
- FK: `worker_id → project_workers`, `project_id → projects`, `expense_id → expenses` (nullable, popunjen po RPC-u).
- Period: `period_start date NOT NULL`, `period_end date NOT NULL`, CHECK `period_end >= period_start`.
- Iznosi: `hours_covered numeric(10,2)`, `hourly_rate_snapshot numeric(10,2)`, `gross_amount numeric(12,2)`, `paid_amount numeric(12,2)`.
- Meta: `payment_source text`, `paid_at timestamptz NOT NULL`, `note text`, `status text` (`paid`|`partial`|`advance`|`voided`), `voided_at`, `voided_by`.
- Avansi: `linked_advance_expense_ids uuid[]` (za buduće netting; v1 popunjava, ne konzumira).
- Standard: `created_by uuid`, `created_at`, `updated_at`, `deleted_at`.
- **GRANT** authenticated (SELECT + all via RPC), service_role ALL. **RLS** enabled. Policy: owner sve; ostali samo payouti gdje je `EXISTS (worker WHERE worker.user_id = auth.uid())`. INSERT/UPDATE/DELETE **denied** za sve — sve ide kroz RPC.

**Nova tablica `public.project_work_entry_locks` (audit):**
- `entry_id → project_work_entries`, `payout_id → project_worker_payouts`, `locked_at`, `unlocked_at`, `unlocked_by`, `unlock_reason text`.
- Append-only (nema UPDATE/DELETE policy). Read: owner + radnik čiji je entry.

**Izmjene postojećih tablica:**
- `project_work_entries`: dodati `payout_id uuid` (nullable) + `locked bool DEFAULT false` (derived, ali indexed). SELECT/UPDATE trigger blokira izmjene kad `locked=true` osim kroz allow-flag.
- `expenses`: dodati `worker_payout_id uuid` (nullable, FK). Trigger na UPDATE/DELETE — ako NOT NULL, blokiraj osim s allow-flag.

**RLS rewrite (blast-radius izvan payouta — potvrditi):**
- `project_work_entries` SELECT: owner OR own worker.
- `project_workers` SELECT: owner OR `user_id = auth.uid()`.

### 2.2 SECURITY DEFINER RPC-ovi

Svi slijede `set_source_anchor` uzorak: `SET search_path = public`, ownership check preko `is_project_owner`, `REVOKE ALL FROM PUBLIC`, `REVOKE EXECUTE FROM anon`, `GRANT EXECUTE TO authenticated, service_role`.

1. **`create_worker_payout(p_worker_id, p_project_id, p_period_start, p_period_end, p_paid_amount, p_payment_source, p_paid_at, p_note, p_lock_entries bool)`**
   - Ownership check.
   - Izračun `hours_covered` iz entries u periodu (koji nisu već zaključani na drugi payout).
   - Snapshot `hourly_rate` iz `project_workers`.
   - `SET LOCAL app.allow_payout_write = 'true'`.
   - INSERT payout, INSERT expense (manual_entry intent, `event_at = p_paid_at`, `work_type='salary'`, `worker_payout_id = <new>`), UPDATE entries `payout_id = <new>`, INSERT lock audit rows.
   - RETURN jsonb `{payout_id, expense_id, hours_covered, gross_amount, entries_locked}`.

2. **`void_worker_payout(p_payout_id, p_reason)`** — atomarno: soft-delete expense, `status='voided'`, `payout_id` na entrijima → NULL, audit unlock rows.

3. **`unlock_work_entry(p_entry_id, p_reason)`** — samo owner; skida `payout_id`, upisuje audit; NE dira payout (payout ostaje s originalnim `hours_covered`; UI računa deltu i predlaže "adjustment payout").

4. **`update_locked_work_entry(p_entry_id, p_actual_hours, p_note)`** — bonus: unlock + update + relock u istoj transakciji, audit dobija old→new snapshot.

### 2.3 Triggeri (zaštita integriteta)

- `expenses` BEFORE UPDATE/DELETE: ako `OLD.worker_payout_id IS NOT NULL` i `app.allow_payout_write` ≠ 'true' → RAISE. Whitelist za bank-match polja.
- `project_work_entries` BEFORE UPDATE/DELETE: ako `OLD.payout_id IS NOT NULL` i allow-flag off → RAISE.

### 2.4 UI (frontend, minimalno površine)

- **`WorkerDetail`** dobiva sekciju "Isplate": lista payouta + "Nova isplata" gumb.
- **`CreatePayoutDialog`**: period picker (Ovaj mjesec / Prošli mjesec / Custom), preview `hours × rate = gross`, edit `paid_amount`, `payment_source`, `paid_at`, `note`, checkbox "Zaključaj radne dane" (default ON).
- **`WorkerPayoutList`**: badge status, "preostalo za isplatu = planirano − isplaćeno" istaknuto.
- **Kalendar work_entries**: zeleni checkmark na zaključanim danima, lock ikonica; klik na zaključan dan → owner vidi "Otključaj" + audit history, radnik vidi read-only info.
- **Project card**: dodati "Preostalo radnicima: X EUR" liniju (ako > 0).
- **`UnlockEntryDialog`** (owner-only): reason input, prikaz delte nakon spremanja.
- Svi tekstovi kroz `t()` (hr/en/de).
- Write akcije guardane `useProjectWriteGuard` + `deriveProjectPermissions.canManageWorkerPayouts` (novi flag; samo owner).

### 2.5 Balance engine kompatibilnost

- Payout expense se piše kroz postojeći `addExpense` helper s eksplicitnim `event_at = paid_at`, `expense_nature = null` (default 'transaction'), `intent = 'manual_entry'`.
- Nikakve promjene anchor logike, nikakve nove event grane. B9 guard iz Faze B balance sage nije pogođen.

### 2.6 Testovi (blocking gate)

**Vitest (pure helpers):**
- `computePayoutPreview` — hours × rate, exclusion locked entries, tolerancije.
- `derivePayoutStatus` — paid/partial/advance/voided iz iznosa.
- `computeRemainingForWorker` — planirano − sum(paid).
- Permission matrix za nove capability.

**SQL balance suite (deploy gate):**
- P1: create_worker_payout na anchored izvoru s `paid_at > anchor` → saldo pada za `paid_amount`.
- P2: create_worker_payout s `paid_at < anchor` → saldo nepromijenjen (povijesni).
- P3: void_worker_payout → saldo se vraća, entry unlock, audit red postoji.
- P4: unlock_work_entry + update actual_hours → payout ostaje, delta izračunljiva, novi payout dodaje razliku bez double-counta.
- P5: direktan UPDATE expensea s payout_id (bez allow-flag) → RAISE.
- P6: direktan UPDATE work_entry s payout_id (bez allow-flag) → RAISE.
- P7: RLS — radnik A ne vidi entrije/payoute radnika B (SELECT vraća 0 redova).

**Dodati nove migracije u `BALANCE_MIGRATIONS.txt`** kronološki.

### 2.7 Redoslijed isporuke (jedan PR)

1. Migracija: nove tablice + kolone + triggeri + RLS rewrite + 4 RPC-a + GRANT/REVOKE po security-definer-anon-revoke pravilu.
2. Types regen (nakon approve).
3. Hookovi: `useWorkerPayouts`, izmjene `useProjectWorkEntries` (poštuju lock).
4. UI komponente + i18n.
5. Vitest testovi (helperi).
6. SQL suite scenariji P1–P7.
7. Whitelist novih migracija.
8. Dashboard/project card "preostalo" agregat.
9. Push notifikacija radniku (reuse postojećeg kanala).
10. CSV export payouta (jedan handler, reuse `fileExport.ts`).

### 2.8 Otvorena pitanja za vlasnika prije koda

1. **RLS blast-radius:** OK je da radnik ODMAH nakon merge-a prestane vidjeti tuđe entrije i satnice (danas ih vidi)? To je ispravak curenja, ali je vidljiva promjena.
2. **`paid_at` immutable** (korekcija samo kroz void + novi payout)? Ili dopustiti edit datuma?
3. **`rate_snapshot` na work_entries** — odbačen za v1, prihvaća se rizik "rate promijenjen usred perioda → gross se računa po trenutnoj". OK?
4. **Push obavijest radniku** — uključiti u v1 ili ostaviti za sljedeći pass?
5. **CSV export payouta** — v1 ili kasnije?

Očekujem odgovore ili "sve OK, kreni". Nakon toga jedan PR s cijelim opsegom + zeleni CI gate (vitest + SQL suite + Actions).
