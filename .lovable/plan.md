# Krug Transport & Error Mapping Plan v1.1

Block G dokument. Definira **konkretan transport** i **error→ishod mapiranje** za sve endpointe iz `Krug Endpoint Contract Plan v1.1` (E1, E2, E3, E4, E5, E7, E-edit). Bez SQL-a, bez RPC tijela, bez TypeScript koda, bez UI-a, bez migracija. Samo ugovor o žici.

Promjena u odnosu na v1: **A7 semantika ispravljena.** A7 je governance akt `shared → personal` unutar postojećeg Krug konteksta — mijenja **isključivo** `krug_shared_status → NULL`, a `krug_id` **ostaje postavljen**. `krug_id → NULL` pripada isključivo post-delete flowu i nema veze s A7.

Pretpostavlja kao zaključano:
- `Krug API Boundary v1.1` — 7 akata, 5 hipoteza H1–H5, dual autorizacija (governance/RGA vs author-with-initiation).
- `Krug RLS Implementation Plan v1.1` — razdvojeni autorizacijski helperi.
- `Krug Endpoint Contract Plan v1.1` — E1–E5, E7, E-edit; 11 ishoda; A6 = system path.

---

## 1. Cilj

Za svaki endpoint odgovoriti na 4 pitanja:
1. **Transport** — PostgREST RPC ili edge funkcija?
2. **Request shape** — što klijent šalje (i kako se cilja red)?
3. **Response shape** — kako server javlja ishod (uvijek deterministički).
4. **Error mapiranje** — kako se Postgres/HTTP greške svode na 11 ishoda iz §4.3 v1.1.

Dokument NE uvodi nove akte, ne mijenja autorizaciju, ne dira A6 sistemski put, ne dira post-delete flow.

---

## 2. Odluka o transportu (po endpointu)

| Endpoint | Akt | Tranzicija | Transport | Razlog |
|---|---|---|---|---|
| E1 | A1 potvrda | `predložena → potvrđena` (status only) | RPC | RLS + jedna update naredba, bez vanjskih efekata |
| E2 | A2 veto | `predložena → nepotvrđena` (status only) | RPC | Isto |
| E3 | A3 opoziv potvrde | `potvrđena → nepotvrđena` (status only) | RPC | Isto |
| E4 | A4 povlačenje | DELETE redak (post-delete flow) | RPC | DELETE pod RLS-om, atomski |
| E5 | A5 ponovno pokretanje | `nepotvrđena → predložena` (status only) | RPC | State tranzicija |
| E7 | A7 shared → personal | `krug_shared_status → NULL`, `krug_id` **ostaje** | RPC | State tranzicija unutar postojećeg Krug konteksta |
| E-edit | field edit | netranzicijska polja na `predložena` | PostgREST PATCH | Nije tranzicijski akt, ne treba server-side helper |

**Napomena o A7:** ovo je governance akt koji **uklanja redak iz shared toka** unutar istog kruga — ne uklanja vezu prema krugu. `krug_id IS NULL` semantika rezervirana je isključivo za post-delete flow (vidi §8.1) i ovaj dokument je nigdje ne veže za A7.

**Otvoreno za potvrdu prije builda:** koristimo li **jednu** RPC funkciju `krug_apply_act(p_expense_id, p_act)` koja interno grana na E1/E2/E3/E5/E7, ili **šest** zasebnih RPC-a? Preporuka v1: **jedna funkcija** s `p_act` enumom — manje površine, jedno mjesto za audit, jedinstven response shape. E4 ostaje zaseban jer je DELETE semantika drukčija. E-edit ostaje PostgREST PATCH.

---

## 3. Request shape (klijent → server)

### 3.1 RPC pozivi (E1, E2, E3, E5, E7)

```
rpc('krug_apply_act', {
  p_expense_id: uuid,
  p_act: 'A1' | 'A2' | 'A3' | 'A5' | 'A7',
  p_client_request_id: uuid   // za idempotenciju, opcionalno
})
```

- `p_expense_id` cilja **točno jedan** red (per-row atomicity, §4.1 v1.1).
- `p_act` je enum string, ne magic broj.
- `p_client_request_id` je opcionalan UUID za dedup ponovljenog poziva (§7.1).
- Niti jedan od ovih akata, uključujući A7, **ne dira `krug_id` kolonu**. A7 mijenja samo `krug_shared_status` na `NULL`.

### 3.2 RPC poziv (E4 — povlačenje)

```
rpc('krug_withdraw', {
  p_expense_id: uuid,
  p_client_request_id: uuid   // opcionalno
})
```

Zaseban RPC jer interno radi `DELETE`, ne `UPDATE`. Autorizacija: **H5 ∧ H2** (author koji je owner/full member). Post-delete flow (uklj. eventualno otpuštanje `krug_id` na povezanim entitetima) dokumentiran je u §8.1, izvan ovog dokumenta.

### 3.3 PostgREST PATCH (E-edit)

```
PATCH /rest/v1/expenses?id=eq.<uuid>
Body: { description?, amount?, ... }   // samo whitelistana polja, NE krug_shared_status, NE krug_id
```

- Autorizacija: RLS policy `H5` (author).
- Tranzicijska polja (`krug_shared_status`) i strukturna polja (`krug_id`) **moraju biti odbijena RLS column-level pravilom ili trigger guardom** — to je posao Block RLS v1.1, ovaj dokument samo bilježi zahtjev.

---

## 4. Response shape (server → klijent)

### 4.1 Uspjeh i deterministički ishod

Sve RPC funkcije vraćaju **isti JSON oblik**, jedan red:

```json
{
  "outcome": "applied" | "noop_already_in_target_state" | "noop_idempotent_replay"
            | "wrong_state" | "not_found" | "not_authorized_member" | "not_in_scope"
            | "not_author" | "not_full_member" | "unauthenticated"
            | "invariant_violation" | "conflict_concurrent",
  "expense_id": "uuid",
  "act": "A1" | "A2" | "A3" | "A4" | "A5" | "A7" | null,
  "previous_status": "predložena" | "potvrđena" | "nepotvrđena" | null,
  "new_status":      "predložena" | "potvrđena" | "nepotvrđena" | null,
  "krug_id": "uuid"
}
```

- `outcome` je **uvijek prisutan** i jedan od 11 ishoda iz Endpoint Contract v1.1 §4.3.
- `krug_id` u response-u je **uvijek isti** prije i poslije akta za sve RPC tranzicije (uključujući A7). Klijent ga koristi za invalidaciju cachea po krugu.
- Za A7: `previous_status` je jedan od shared statusa (`predložena`/`potvrđena`/`nepotvrđena`), `new_status` je `NULL` (redak više nije u shared toku), `krug_id` ostaje nepromijenjen.
- Za A4: redak je obrisan, pa server vraća `previous_status` zadnjeg poznatog stanja i `new_status = null`. `krug_id` u response-u nosi vrijednost koju je redak imao prije DELETE-a, isključivo za klijentsku invalidaciju cachea — to **nije** trvanje veze, redak više ne postoji.
- HTTP status je **200 čak i za poslovne odbijenice** (`wrong_state`, `not_authorized_member`, `not_in_scope`, `not_author`, `not_full_member`, `invariant_violation`). Razlog: klijent mora razlikovati “server me odbio iz poslovnog razloga” od “mreža je pala” — različiti HTTP kodovi za poslovne ishode bi zamutili tu granicu i provocirali pogrešne retry-eve.
- **401** rezerviran isključivo za `unauthenticated` (JWT istekao ili nema ga).
- **409** rezerviran isključivo za `conflict_concurrent` (vidi §7.2).
- **5xx** = stvarna serverska greška, ne smije nikad nositi `outcome`.

### 4.2 E-edit (PATCH)

PostgREST native shape:
- **2xx + redak** = uspjeh.
- **404 / prazan response** = `not_found` ili RLS sakrio red (klijent ih mora tretirati identično: “nemam pravo ili ne postoji”).
- **403** = RLS odbio (npr. pokušaj patcha `krug_shared_status` ili `krug_id` polja).
- Bez `outcome` polja — E-edit nije tranzicijski akt, ne ulazi u 11-ishod model.

---

## 5. Error → ishod mapiranje (RPC sloj)

Kako Postgres greške (RLS, check, conflict) postaju jedan od 11 deterministicnih ishoda **unutar RPC funkcije** (a ne na klijentu):

| Izvor | Detekcija unutar RPC | Ishod |
|---|---|---|
| `auth.uid() IS NULL` | guard na ulazu | `unauthenticated` (HTTP 401) |
| red ne postoji ili RLS ga skriva | `SELECT ... FOR UPDATE` vraća 0 redova | `not_found` |
| red postoji, `krug_id IS NULL` | provjera nakon lock-a | `wrong_state` |
| red postoji, `krug_shared_status IS NULL` i akt zahtijeva shared red | provjera nakon lock-a | `wrong_state` |
| red postoji, status nije ulazni za traženi akt | provjera nakon lock-a | `wrong_state` |
| red već u ciljnom stanju (za A7: `krug_shared_status` već `NULL`) | provjera nakon lock-a | `noop_already_in_target_state` |
| `p_client_request_id` već viđen za isti `(expense_id, act)` | dedup tablica | `noop_idempotent_replay` |
| user nije član kruga (governance akt) | poziv helpera za RGA | `not_authorized_member` |
| user je član ali nije financijski pogođen (H3) | poziv helpera | `not_in_scope` |
| user nije autor (author akt) | provjera `expenses.user_id` | `not_author` |
| user je autor ali nije owner/full member (E4/E5) | provjera H2 | `not_full_member` |
| invarijanta (npr. shared status postavljen, a `krug_id IS NULL`) | check unutar funkcije | `invariant_violation` |
| concurrent update detektiran | optimistic version mismatch | `conflict_concurrent` (HTTP 409) |

**Pravilo:** RPC funkcija **nikad ne smije propustiti sirovu Postgres iznimku klijentu kao 5xx** ako je uzrok jedan od 11 ishoda. 5xx je rezerviran za stvarne bug-ove (sintaksa, missing column, OOM).

---

## 6. Error → ishod mapiranje (klijent)

Klijent (React/TanStack Query mutation) prima:

1. **2xx + body s `outcome`** → koristi `outcome` direktno, ne pogađaj iz teksta.
2. **401** → `unauthenticated`, redirect na re-auth.
3. **409** → `conflict_concurrent`, refetch + dopusti retry.
4. **5xx ili network error** → tehnička greška, NIJE jedan od 11 ishoda; prikaži generičku poruku + retry button. Ne smije se mapirati u `wrong_state` ili `not_found` da ne sakrije stvarni bug.
5. **PostgREST 403 (E-edit)** → tretiraj kao `not_authorized_member` ekvivalent za UX svrhe, ali bez upisa u audit (PATCH nema audit zapis na razini akta).

---

## 7. Idempotencija i concurrency

### 7.1 Idempotencija

- Klijent **smije** poslati `p_client_request_id` (UUID v4).
- Server vodi minimalnu dedup memoriju za parove `(user_id, expense_id, act, client_request_id)` u kratkom prozoru (preporuka: **24 h**).
- Ponovljeni poziv s istim `p_client_request_id` vraća **isti** outcome kao prvi (tipično `applied` → `noop_idempotent_replay` na drugom pozivu).
- Bez `p_client_request_id` server radi posao, ali drugi poziv može legitimno vratiti `noop_already_in_target_state` (što nije isto što i `noop_idempotent_replay` — prvi znači “netko drugi je već to napravio”, drugi znači “ti si već to napravio”).

**Otvoreno za potvrdu:** TTL dedup prozora (24 h preporuka v1).

### 7.2 Concurrency

- Svaki RPC uzima **row-level lock** (`SELECT ... FOR UPDATE`) na ciljni expense prije provjera.
- Ako između čitanja klijenta i RPC poziva netko drugi promijeni status u **isti ciljni** status → `noop_already_in_target_state` (vrijedi i za A7: ako je netko drugi već prebacio na `krug_shared_status = NULL`).
- Ako netko promijeni status u **različit** status (npr. paralelno A2 dok ti šalješ A1) → `wrong_state` (jer ulazni state više nije `predložena`).
- `conflict_concurrent` (HTTP 409) rezerviran je samo za slučaj kad detektiramo da je redak izmijenjen **u trenutku našeg UPDATE-a** (npr. preko `xmin` ili eksplicitne `version` kolone, ako Block RLS v1.1 to uvede). Ako verzioniranje nije uvedeno, ishod `conflict_concurrent` se **ne emitira** u v1 i taj ulazak ostaje rezerviran za buduću proširenu kontrolu.

---

## 8. Granice prema susjednim flow-ovima

### 8.1 Post-delete flow (izvan scope-a)

`krug_id → NULL` semantika **pripada isključivo post-delete flowu**, ne nijednom od 7 Krug akata. Ako uopće postoji slučaj u kojem `krug_id` ide na `NULL` (npr. nakon A4 DELETE-a, na povezanim entitetima koji prežive), to je tema zasebnog dokumenta i ovaj dokument ga ne specificira. Niti jedan endpoint definiran ovdje ne smije mijenjati `krug_id`.

### 8.2 A6 (48h expiry) — sistemski put

- Nema klijentski endpoint, **nema HTTP/JSON ugovor** prema klijentu.
- Cron/edge worker poziva **drugi** RPC (`krug_expire_proposals`) koji:
  - bypassuje RLS (`SECURITY DEFINER`),
  - obrađuje skup redova starijih od 48h u stanju `predložena`,
  - mijenja ih u `nepotvrđena` (samo `krug_shared_status`, `krug_id` ostaje),
  - piše audit zapis tipa `A6_expired`.
- Dokumentirano ovdje samo radi potpunosti; sve detalje pokriva poseban Block (Worker plan).

---

## 9. Što ovaj dokument NE radi

- Ne piše SQL ni RPC tijela.
- Ne uvodi nove akte ni nova stanja.
- Ne odlučuje o audit shemi (zaseban Block H).
- Ne odlučuje o UI komponentama, kopiji, i18n ključevima.
- Ne dira A6 worker raspored.
- Ne specificira post-delete flow ni bilo koju mutaciju `krug_id` kolone.

---

## 10. Otvorena pitanja prije sljedećeg dokumenta

1. Jedna RPC funkcija `krug_apply_act` ili šest zasebnih? **(preporuka v1: jedna)**
2. TTL dedup prozora za `p_client_request_id`? **(preporuka v1: 24 h)**
3. Uvodimo li `version` kolonu za `conflict_concurrent` već u v1, ili odgađamo i privremeno isključujemo taj ishod? **(preporuka v1: odgoditi, ne emitirati `conflict_concurrent`)**
4. Format `p_expense_id` — `uuid` (preporuka) ili composite ključ? **(preporuka v1: uuid)**

---

## 11. Sljedeći korak

Nakon odobrenja ovog dokumenta sljedeći plan dokument je **Block H — Audit & Telemetry Plan v1** (što se zapisuje, gdje, s kojim PII pravilima), ili direktno **Block RLS Migration Plan v1** ako želiš preskočiti audit u prvoj iteraciji. To je tvoja odluka.
