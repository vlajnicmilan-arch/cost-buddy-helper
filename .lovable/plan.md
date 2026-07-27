
# Auto-sidro pri povezivanju banke

Prijedlog izvedbe. Ne dira balance engine, ne mijenja triggere, ne dira `bank-sync-transactions`. Milan odobrava prije koda.

## 1) `bank-link-account` — `create_new` grana

**Pristup:** proširiti INSERT u `custom_payment_sources` tako da odmah odražava bankin saldo. Bez novih RPC-ova, bez naknadnog `align_source_to_bank` poziva (align nema smisla za tek kreiran source jer još nema audit povijesti, a bank_reconciliation je semantički "user prihvatio batch").

Konkretno u `create_new`:
- pročitati `bank_accounts.balance` i `last_synced_at` (već imamo `account` u handleru, samo treba dodati polja u SELECT).
- INSERT u `custom_payment_sources` dodati:
  - `balance = bank.balance ?? 0`
  - `correction_anchor_balance = bank.balance ?? 0`
  - `correction_anchor_date = bank.last_synced_at ?? now()`
  - `anchor_source = 'bank_reconciliation'` (vidi §4 — razlog zašto ne novi enum)
- Autoseed trigger `_cps_autoseed_anchor` je `IF correction_anchor_date IS NULL` — pošto ga eksplicitno postavljamo, trigger se ne aktivira i nema kolizije.
- Ako `bank.balance IS NULL` (banka ne javlja saldo): fallback na staro ponašanje (autoseed 0). Nema regresije.

**Audit trag:** ručno INSERT-nuti red u `anchor_audit` iz iste edge funkcije (service role) s `anchor_source='bank_reconciliation'` i reason npr. `"bank-link-account: initial anchor from bank balance"`. Time postoji povijest zašto je sidro takvo.

**Zašto ne pozvati `align_source_to_bank` nakon inserta:** RPC koristi `auth.uid()` i traži da je caller owner — edge funkcija se poziva s user JWT-om pa bi radilo, ali RPC je pisan za "user prihvatio bankin batch" scenarij (radi idempotenciju po zadnjem audit redu, forsira `+1s` na anchor date, itd.). Za prvi insert je čišće postaviti polja izravno u istoj INSERT transakciji — jedna atomska operacija, bez race window-a između INSERT-a (autoseed=0) i naknadnog UPDATE-a.

## 2) `bank-link-account` — `link_existing` grana

**Pristup:** NE gaziti sidro automatski. Postojeći novčanik može imati:
- ručno postavljeno sidro (`set_source_anchor`, `user_confirmed`),
- povijest reconciliation-a,
- transakcije korisnika koje ne dolaze iz banke.

Automatski override bi tiho uništio korisnički unos. Predlažem:
- link_existing radi samo mapping (kao sada) — bez diranja sidra.
- Odvojeno: nakon uspješnog linka, klijent (Wallet) može detektirati mismatch između `bank_accounts.balance` i `custom_payment_sources.balance` i ponuditi postojeći "Poravnaj s bankom" flow (koji već postoji kao `align_source_to_bank` RPC + `ReconciliationDialogHost`). Ako UI trenutno ne izlaže taj gumb u Wallet listi, to je zaseban UX zadatak — ne dio ovog plana.

Ukratko: **auto-sidro samo za `create_new`. Za `link_existing` — ništa automatski.**

## 3) Jednokratni fix za Milanov -3,00 račun

Milan pokreće ručno (ne edge fn), preko `set_source_anchor` RPC-a. Poziv (za Milanov auth kontekst iz aplikacije, ili SQL kroz supabase--insert sa service role kontekstom):

```sql
SELECT public.set_source_anchor(
  p_source_id   => 'd28bc2f5-8340-4c8f-8e69-45b0e5619d59'::uuid,
  p_new_balance => -3.00,
  p_as_of       => now(),
  p_reason      => 'Manual fix: bank-link-account nije prenio bankin saldo pri kreiranju'
);
```

To će:
- upisati `user_confirmed` audit red (Milan je izričito potvrdio -3,00),
- postaviti balance i sidro na -3,00,
- recompute će od tog trena raditi ispravno.

Prije izvršenja: potvrditi da RPC `set_source_anchor` postoji s tim potpisom (imamo referencu na njega u memoriji "Balance Anchor RPC"). Ako signatura odstupa, prilagoditi parametre.

**Napomena:** Milanov konkretan slučaj je odvojen od koda §1. Kod §1 sprječava buduće ponavljanje; §3 popravlja jedan postojeći red.

## 4) `anchor_source` vrijednost

Postojeći enum (`anchor_source_type`): `user_confirmed`, `migration`, `bank_reconciliation`, `system_initial`.

**Preporuka: reuse `bank_reconciliation`.** Semantički: "sidro dolazi iz podataka koje je banka javila". `bank_reconciliation` već pokriva taj scenarij (koristi ga `align_source_to_bank`). Razlikovati "prvo povezivanje" od "kasnijeg poravnavanja" možemo kroz `reason` polje u `anchor_audit` (`"bank-link-account: initial anchor from bank balance"` vs `"align_source_to_bank: user prihvatio..."`) — enum ne treba širiti.

**Alternativa (ne preporučujem sada):** dodati `'bank_initial'` u enum. Zahtijeva migraciju + update svih mjesta koja switchaju po enumu (uključujući filter u `align_source_to_bank` idempotency check). Više posla, mala vrijednost.

Ako Milan želi jasnu distinkciju u audit reportima — dodajemo enum vrijednost u zasebnoj maloj migraciji, ali to je opcionalno i može čekati.

## 5) Rizik i doseg

**Ne dira se:**
- `recompute_custom_source_balance` / `_preview` (balance engine) — ostaje bit-for-bit.
- `_cps_autoseed_anchor` trigger — logika `IF correction_anchor_date IS NULL` znači da ga eksplicitno postavljanje polja u INSERT samo "preskoči". Nema promjene trigger definicije.
- `_cps_balance_guard_before/after` — pišemo balance u istom INSERT-u kao anchor, guard je zadovoljan (writer intent postavljen kroz app.balance_writer nije potreban za INSERT novog reda; guardovi štite UPDATE-e postojećih redova, ali provjerit ćemo prije koda da INSERT put ne trigira SP tuple mismatch — ako trigira, koristimo `set_config('app.balance_writer', 'engine', true)` unutar edge fn kroz `admin.rpc` wrapper ili SQL blok).
- `bank-sync-transactions` — apsolutno netaknuto. Sync i dalje piše u `bank_accounts.balance` i INSERT-a transakcije; sidro se ne prepisuje pri sync-ovima. Ovo je ključno da se ne izgube ručne korekcije.
- `align_source_to_bank`, `set_source_anchor` — netaknuti, i dalje jedini put za naknadno pomicanje sidra.
- Balance regression test suite (SQL harness + vitest mirror) — očekuje se zeleno; nova grana radi samo pri INSERT-u novog sourca s bank-link kontekstom, ne mijenja postojeće redove.

**Dira se:**
- `supabase/functions/bank-link-account/index.ts` — jedan file, `create_new` grana (linije 65–94). Dodaju se dva polja u SELECT bank_accounts, četiri polja u INSERT custom_payment_sources, i jedan INSERT u `anchor_audit`.
- (Opcionalno §3) jednokratni SQL poziv `set_source_anchor` — ne trajni kod.

**Rubni slučajevi za razmotriti prije koda:**
- Banka javi `balance = 0` (legitimno prazan račun) → sidro 0 je ispravno.
- Banka javi `balance = NULL` → fallback na trenutno ponašanje (autoseed 0). Ne gore od danas.
- Više subaccountsa istog IBAN-a (EUR + HRK, kao Milanov slučaj s HR41 i HR47) → svaki `create_new` link je zaseban source, zaseban INSERT, svaki dobiva svoj balans iz svog `bank_accounts` reda. Bez interferencije.
- `last_synced_at IS NULL` na tek povezanom računu (prije prvog sync-a) → koristi `now()` kao `correction_anchor_date`. Bank-sync koji stigne kasnije s transakcijama datiranima prije `now()` bit će odrezan po day-cut/hybrid pravilu — što je namjerno (sidro je "istina od ovog trena").

**Ostaje netaknuto:** RLS, RBAC, entitlements, Krug, projekti, budgets, recurring, sve ostalo.

## Sažetak koraka nakon Milanovog "gradi"

1. Edit `supabase/functions/bank-link-account/index.ts` — proširiti SELECT i INSERT u `create_new` grani, dodati INSERT u `anchor_audit`.
2. Deploy edge funkciju.
3. Jednokratni `set_source_anchor` poziv za Milanov `d28bc2f5…` na -3,00.
4. Validacija: pokrenuti balance SQL suite (`supabase/tests/balance/`) — mora biti zeleno.
5. Vitest full run — mora ostati 2114/2114.
6. Ručni test: novi bank link kroz Wallet → provjeriti da novi source odmah pokazuje bankin saldo.

Ne gradim ništa dok Milan izričito ne kaže "gradi".
