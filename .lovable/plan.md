## Faza 0 dopuna — verifikacija 3 nejasne SECDEF funkcije (read-only)

Status: čista analiza. Ništa nije odobreno za izmjenu. Milan odlučuje sljedeći korak.

---

### 1. `unmerge_import_row(p_id uuid)` — SIGURNA

- **auth.uid() guard:** DA. Prvi red tijela: `v_uid := auth.uid(); IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'`.
- **NULL / anon poziv:** Baca `not_authenticated` prije bilo kakvog UPDATE-a.
- **Cross-user rizik:** Nema. `UPDATE ... WHERE id = p_id AND user_id = v_uid AND bank_match_status = 'confirmed'` — WHERE veže na vlasnika; tuđi redak ne odgovara i tiho se ignorira (0 rows).
- **Ocjena:** SIGURNA. `anon` grant je ipak nepotreban (odbija se odmah), ali ne otvara rupu.

---

### 2. `upsert_active_issue(p_type, p_dedup_key, p_severity, p_title, p_message, p_data, p_entity_type, p_entity_id)` — SIGURNA

- **auth.uid() guard:** DA. `IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'`.
- **Validacija:** `dedup_key` obavezan, `severity` mora biti `info|warning|critical`.
- **NULL / anon poziv:** Baca `not_authenticated`, nema INSERT-a.
- **Cross-user rizik:** Nema. Svi SELECT/UPDATE/INSERT tvrdo koriste `user_id = v_uid` (auth.uid()) — pozivač ne može ciljati tuđi red niti ga kreirati u tuđe ime. `entity_id` je samo podatak koji se sprema u vlastitu notifikaciju.
- **Ocjena:** SIGURNA.

---

### 3. `recompute_custom_source_balance(p_source_id uuid)` — RANJIVA (write path)

- **auth.uid() guard:** NEMA. Funkcija ne provjerava tko zove.
- **NULL / anon poziv:** Izvršava se do kraja. Ako source postoji i ima anchor, računa i **UPDATE-a `custom_payment_sources.balance`** bilo kojeg (i tuđeg) `p_source_id` na "engine" izračun.
- **Cross-user posljedica:**
  - Piše preko `balance` polja tuđeg wallet-a bez autentikacije (postavlja `app.balance_writer='engine'` da preskoči guard trigger).
  - Ako je izvor **unanchored**, vraća NULL i ništa ne piše (rani return u redu 26–28) — u tom slučaju nema efekta.
  - Ako je **anchored**, anonimac koji zna/pogodi UUID može forsirati rekalkulaciju (nema direktnog "injectiona" novih iznosa, ali može ovrsiti korisničku vrijednost salda kada je izvor u anchor stanju; također može bacati eksepcije/lockove kroz `FOR UPDATE`).
- **Otkrivanje tuđeg salda:** Da — funkcija vraća `v_new_balance` kao rezultat poziva, što je efektivno saldo tuđeg wallet-a kada je anchored.
- **Ocjena:** RANJIVA (leakage + neovlašten write nad anchored sourceima).

---

### 4. `recompute_custom_source_balance_preview(p_source_id uuid, p_mode text)` — RANJIVA (read leak)

- **auth.uid() guard:** NEMA.
- **STABLE, ne piše:** ne mijenja podatke, ali **vraća** `v_anchor_balance + v_sum` — tj. izračunati saldo tuđeg custom source-a ako je anchored.
- **NULL / anon poziv:** Prolazi. Za unanchored ili nepostojeći source vraća NULL (nema leakage u tom podskupu). Za anchored source vraća numerički saldo.
- **Cross-user posljedica:** Anonimac koji zna UUID tuđeg anchored source-a dobiva njegov trenutni izračunati saldo.
- **Ocjena:** RANJIVA (information disclosure za anchored sourceove).

---

### Zaključak (činjenično)

| Funkcija | Guard | Piše | Leaka tuđe | Ocjena |
|---|---|---|---|---|
| `unmerge_import_row` | ✅ | own only | ne | SIGURNA |
| `upsert_active_issue` | ✅ | own only | ne | SIGURNA |
| `recompute_custom_source_balance` | ❌ | DA (tuđi anchored balance) | DA (return value) | RANJIVA |
| `recompute_custom_source_balance_preview` | ❌ | ne | DA (anchored balance) | RANJIVA |

Ublažavajući faktor za obje `recompute_*`: napadaču treba UUID `custom_payment_sources.id` (nije javno enumeriljiv preko RLS-a). Ali UUID nije autentikacija — zaštita ovisi o njegovoj tajnosti, što nije prihvatljivo za SECDEF s `anon` grantom.

Bez preporuke o izvršenju — čeka se Milanova odluka.