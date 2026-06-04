# Implementation Sprint v1.1 — Krug First Honest Skeleton

Ispravak v1 prema 5 zaključanih temelja. Bez novih ideja, bez širenja scope-a.

---

## A. Implementation Sprint v1.1 — task blokovi

### T1. Core Krug schema
**Što gradimo**
- Tablice: `krug`, `krug_ownership`, `krug_membership`.
- Enumi (strogo prema zaključanom modelu):
  - `krug_preset` — samo zaključani presetovi iz Preset Constraint Matrix v1, **bez `family`**.
  - `krug_membership_role` — **`punopravni` | `obični`**. Owner **nije** membership role; vodi se isključivo kroz `krug_ownership`.
  - `krug_lifecycle_state` — **`active` | `early_signal` | `ugrožen` | `continuity_window` | `read_only` | `deleted`** (prema Continuity & Billing State Machine v1.3.2).
- Standardne kolone: `id`, `created_at`, `updated_at`, `deleted_at`/`deleted_by` (Soft Delete uzorak).
- `krug_membership` UNIQUE(`krug_id`, `user_id`); `krug_ownership` UNIQUE(`krug_id`) — jedan owner po krugu u v1.
- Triggeri: `update_updated_at_column`.
- GRANT blok prema `public-schema-grants` pravilu.

**Preduvjet**: nijedan.

**Done state**: migracija prošla, RLS uključen bez policy-ja (zaključavajuće), GRANT-ovi zapisani.

**Ne pokriva**: tranzicije lifecycle stateova (te radi Continuity stroj kasnije), audit, realtime, owner transfer, invites.

---

### T2. Core Krug RLS (governance read + write)
**Što gradimo**
- SECURITY DEFINER helperi (RLS Implementation Plan v1.1, razdvojeni governance vs author-with-initiation):
  - `krug_is_member(_krug, _user) returns bool` — istinit za ownera **i** za bilo koji `krug_membership` zapis (`punopravni` ili `obični`).
  - `krug_is_owner(_krug, _user) returns bool` — gleda **isključivo** `krug_ownership`.
  - `krug_is_full_member(_krug, _user) returns bool` — owner ∨ membership s rolom `punopravni`.
- Policies:
  - `krug` SELECT: member.
  - `krug` INSERT: `auth.uid() is not null`. INSERT trigger creatora upisuje **u `krug_ownership`** i **u `krug_membership` s rolom `punopravni`** — nikad ne piše `owner` u membership.
  - `krug` UPDATE: owner only. Preset je NOT NULL i zamrznut (column trigger blokira promjenu, prema Preset Constraint Matrix v1).
  - `krug` DELETE: owner only, soft delete preko `soft_delete_record` RPC.
  - `krug_ownership` SELECT: member; INSERT/UPDATE/DELETE: blokirano u v1 (owner transfer = kasniji val).
  - `krug_membership` SELECT: member; INSERT/UPDATE/DELETE: owner only u v1 (invites kasnije).

**Preduvjet**: T1.

**Done state**: owner kreira krug, vidi ga, mijenja ime; ručno dodan `obični` ili `punopravni` member vidi krug i članove. Niti owner niti bilo tko drugi nije u membershipu s rolom `owner`.

**Ne pokriva**: invite/accept, role promotion, owner transfer, lifecycle tranzicije.

---

### T3. Hooks i read modeli (frontend, neutralno prema UI-u)
**Što gradimo**
- `useMyKrugs()` — krugovi gdje sam member, s presetom i `lifecycle_state`.
- `useKrug(id)` — single krug + owner row iz `krug_ownership` + moj membership row.
- `useKrugMembers(id)` — owner (iz `krug_ownership`) + lista članova iz `krug_membership` s rolom `punopravni`/`obični`. Owner se prikazuje odvojeno, ne kao membership role.
- TanStack Query, `['krug', ...]`, staleTime 5min.

**Preduvjet**: T2.

**Done state**: hookovi vraćaju točne podatke; UI sloj može razlikovati ownera od membera bez gađanja membership role enuma.

**Ne pokriva**: UI komponente, copy, i18n iznad nužnih ključeva za empty stateove.

---

### T4. Shared payment source link
**Što gradimo**
- Tablica `krug_shared_payment_source` (per Shared Resources Link — Structural Choice v1.1): `id`, `krug_id`, `payment_source_id text` (`custom:UUID` ili built-in slug, Balance Sync pattern), `linked_by`, `linked_at`. UNIQUE(`krug_id`, `payment_source_id`).
- RLS:
  - SELECT: `krug_is_member`.
  - INSERT/DELETE: `krug_is_owner` **i** vlasnik / full member tog payment source-a (preko postojećeg `payment_source_members`).
- Hook `useKrugSharedPaymentSources(krugId)` + `linkPaymentSource` / `unlinkPaymentSource`.

**Preduvjet**: T2.

**Done state**: owner povezuje izvor s krugom, svi članovi vide listu, unlink ne dira balanse ni transakcije.

**Ne pokriva**: auto-limited grant članovima (radi postojeći trigger iz Family Shared Source mem; ako se pokaže da ne pokriva krug kontekst, follow-up u Wave 1.5 — namjerno ne dupliciramo).

---

### T5. Transaction Krug polja
**Što gradimo (migracija na `expenses`)**
- `krug_id uuid null references krug(id)`
- `krug_privacy text null` CHECK in (`personal`, `private`, `shared`) — NULL = legacy/ne-Krug zapis.
- `krug_shared_status text null` CHECK in (`predložena`, `potvrđena`, `nepotvrđena`) — samo za `krug_privacy='shared'`.
- Invarijante (CHECK, bez `now()`):
  - `krug_shared_status not null ⇒ krug_id not null AND krug_privacy='shared'`
  - `krug_privacy='shared' ⇒ krug_id not null`
  - `krug_privacy in ('personal','private') ⇒ krug_shared_status is null`
- Indeksi: `(krug_id, krug_shared_status)`, `(krug_id, user_id)`.
- Backfill: nijedan.

**Preduvjet**: T1.

**Done state**: schema prošla; postojeća app nepromijenjena (svi `krug_*` NULL).

**Ne pokriva**: vidljivost (T6), mutacije (T7), approval (T8).

---

### T6. Transaction visibility RLS dopuna
**Što gradimo (strogo po Krug Transaction RLS / Visibility Plan v1.1)**
- Proširujemo postojeću `expenses` SELECT policy s tri Krug grane koje vrijede **samo** kad je `krug_id not null`:
  - **`private`**: vidi **isključivo autor** (`user_id = auth.uid()`), bez obzira na članstvo i preset.
  - **`shared`**: vidi autor **i svaki `krug_is_member`** kruga.
  - **`personal`** (Krug-kontekstualni "personal" — **nije** isto što i skriveno): vidi autor **i članovi kruga prema pravilima preseta**. Konkretno, vidljivost se ne svodi na "vlasnik", nego se delegira na helper:
    - `krug_can_see_personal(_krug, _viewer, _author) returns bool` — implementiran prema Preset Constraint Matrix v1; za presetove gdje preset `personal` izlaže ordinary memberima, helper vraća true za `krug_is_member`.
    - Pravilo prema kojem **ordinary member vidi sve Krug transakcije koje nisu `private`** dolazi direktno kroz ovaj helper za presetove kod kojih je tako zaključano; helper ne smije proširiti vidljivost iznad zaključanog preseta.
- Legacy retci s `krug_id is null` zadržavaju postojeću SELECT logiku (vlasnik + Shared Wallet preko `payment_source_members`) — ne diramo.

**Preduvjet**: T2, T5.

**Done state**: tri Krug grane se ponašaju prema RLS/Visibility v1.1; postojeća non-Krug vidljivost neizmijenjena. SQL test pokriva četiri uloge (autor, ordinary member, full member, autsajder) i tri privatnosti.

**Ne pokriva**: UI filtere, write put (T7), approval (T8).

---

### T7. Transaction mutation minimum
**Što gradimo (unutar postojećeg write puta + jedna nova RPC)**
- **Create u Krug kontekstu**: kad UI eksplicitno proslijedi `krug_id`, write path **mora** dobiti i `krug_privacy` od pozivatelja. Default `krug_privacy` se **ne** određuje u write sloju — bira ga sloj iznad (UI/preset resolver) prema **zaključanim preset defaultima**:
  - partner → `shared`
  - su-roditelj → `personal`
  - cimer → `personal`
  - ostali presetovi: prema Preset Constraint Matrix v1.
  Write sloj samo validira invarijante iz T5 i RLS dopušta INSERT samo ako je autor full member kruga za odabranu privatnost (H5 ∧ H2 tamo gdje je tranzicija u shared tok).
- **Bez Krug konteksta** (`krug_id is null`): write put **nepromijenjen**, ne uvodimo nikakav novi globalni default `krug_privacy`.
- **Field edit**: postojeći PATCH put vrijedi za sva non-tranzicijska polja. RLS column-level guard blokira direktan PATCH `krug_shared_status` i `krug_id`.
- **Tranzicije bez approvala** kroz jednu RPC `krug_set_privacy(p_expense_id, p_new_privacy)` (Transport Plan v1.1, uniformni outcome shape):
  - `personal ↔ private` — samo autor, samo dok `krug_shared_status is null`.
  - `personal/private → shared/predložena` — samo autor koji je full member kruga (H5 ∧ H2).

**Preduvjet**: T6.

**Done state**: autor mijenja privatnost svoje transakcije unutar dopuštenih tranzicija; default privatnosti na create-u dolazi iz preset resolvera, nije implementacijska konstanta write sloja.

**Ne pokriva**: A3, A7 (governance shared→personal), A4 hard-delete idu u T8/Wave 1.5.

---

### T8. Approval skeleton (A1, A2, A4, A5) — **djelomično pokriće**
**Što gradimo**
- RPC-ovi prema Transport Plan v1.1:
  - `krug_apply_act(p_expense_id, p_act, p_client_request_id)` za **A1** (governance, H1+H3), **A2** (governance, H1+H3), **A5** (author H5+H2).
  - `krug_withdraw(p_expense_id, p_client_request_id)` za **A4** (DELETE, author H5+H2; soft delete preko `soft_delete_record`).
- Uniformni response shape (11 ishoda; 200 za biz odbijenice; 401 za unauth; 409 rezerviran ali ne emitiran u v1).
- Dedup tablica `krug_act_dedup(user_id, expense_id, act, client_request_id, outcome, created_at)`, TTL 24h (cleanup cron = Wave 1.5).
- Hook `useKrugAct()` + StatusFeedback bridge.

**Pošteno označeno: ovo je skeleton kompromis, NIJE potpun approval minimum.**
- **A3** (opoziv potvrde) — **nije** u v1, ide u Wave 1.5.
- **A6** (48h system expiry) — **nije** u v1, ide u Wave 1.5. A6 je zaključani dio approval kanala (ne governance, sistemski put), i bez njega `predložena` retci ostaju zauvijek u svom stanju dok ih netko ručno ne dirne. To je svjesni kompromis prvog vala, ne tvrdnja da je approval potpun.
- **A7** (governance shared→personal) — **nije** u v1, ide u Wave 1.5.

**Preduvjet**: T7.

**Done state**: A1, A2, A4, A5 rade s determinističkim ishodima i idempotencijom. UI mora jasno komunicirati da `predložena` stanja u v1 nemaju automatski expiry.

**Ne pokriva**: A3, A6, A7 (eksplicitno).

---

### T9. Wave 1.5 — explicit follow-up scope
Ne implementira se u v1; ovdje samo zaključano što ide odmah nakon T8:
- **A6** system expiry (pg_cron + `krug_expire_proposals` SECURITY DEFINER, prema Transport Plan v1.1 §8.2).
- **A3** opoziv potvrde.
- **A7** governance shared→personal (mijenja **samo** `krug_shared_status → NULL`, `krug_id` ostaje — prema Transport & Error Mapping v1.1).
- Cleanup cron za `krug_act_dedup` (24h TTL).
- Eventualni follow-up za auto-limited grant kroz Krug kontekst ako postojeći `payment_source_members` trigger ne pokriva.

---

## B. Build Order

```text
T1  ─►  T2  ─►  T3
        │
        ├──►  T4              (paralelno s T3 nakon T2)
        │
        └──►  T5  ─►  T6  ─►  T7  ─►  T8
                                       │
                                       └──►  Wave 1.5 (A3, A6, A7, dedup cron)
```

- Strogo sekvencijalno: T1 → T2 → T5 → T6 → T7 → T8.
- Paralelno nakon T2: T3 i T4 (ne diraju `expenses`).
- T6 ne prije T5; T7 ne prije T6; T8 ne prije T7.

---

## C. First Honest Skeleton

Najmanji skup nakon kojeg možemo iskreno reći "Krug postoji u kodu":

**T1 + T2 + T5 + T6 + T7.**

- Krug se kreira (owner u `krug_ownership`, creator u `krug_membership` kao `punopravni`), member se ručno dodaje (`punopravni` ili `obični`), krug se soft-deletea.
- Transakcija nosi `krug_id` + `krug_privacy` + `krug_shared_status` s invarijantama.
- Vidljivost je razdvojena na `private`/`shared`/`personal` prema RLS/Visibility v1.1, uključujući pravilo da ordinary member vidi sve ne-`private` retke za presetove gdje je tako zaključano.
- Autor mijenja privatnost u dopuštenim tranzicijama, default privatnosti na create-u dolazi iz preset resolvera.

Bez T8 imamo skeleton bez governance akcija. T8 dodaje djelomični approval (A1/A2/A4/A5). Bez A3/A6/A7 to **nije** potpun approval minimum, i tako je označeno.

---

## D. Immediate Risks

1. **`expenses` SELECT policy merge.** Krug grane moraju proći kroz jedan izraz, ne paralelni permissive policy (PostgreSQL OR slučajno proširuje). Mitigacija: T6 prepisuje policy s eksplicitnim granama; SQL test pokriva četiri uloge × tri privatnosti × legacy.

2. **`krug_can_see_personal` helper.** Cijela `personal` grana ovisi o korektnoj implementaciji helpera prema Preset Constraint Matrix v1. Greška ovdje znači curenje ili lažno skrivanje. Mitigacija: helper se piše s eksplicitnim per-preset granama, ne kao "default true/false", + per-preset SQL test.

3. **Creator INSERT trigger ne smije pisati `owner` u `krug_membership`.** Lako se zaboravi i razbije `krug_is_full_member`. Mitigacija: trigger eksplicitno upisuje rolu `punopravni`; unit-test na razini SQL-a.

4. **Soft delete kruga vs `expenses.krug_id`.** Soft delete kruga **ne** kaskadira na expenses (Post-Delete Behavior Foundation Patch v1.1; `krug_id → NULL` pripada drugom flowu, nije akt). `krug_is_member` mora tolerirati soft-deletan krug (vraća false za sve osim ownera).

5. **`SELECT ... FOR UPDATE` u svakom RPC-u.** Bez toga `wrong_state` ↔ `noop_already_in_target_state` postaje nedeterministički. Mitigacija: review checklist po RPC-u.

6. **A6 izostanak u v1 vidljiv UI sloju.** Bez 48h expirya `predložena` živi unedogled. To je svjesni skeleton kompromis i mora biti označeno u UI copy-ju (Wave 1.5 zatvara). Nije bug, nego pošteno priznata rupa.

Nema otvorenih product pitanja. Sve odluke unutar 22 zaključana dokumenta.
