# P0 audit — reconciliation, dio 2

Read-only nalaz. Ništa nije mijenjano.

---

## A) `align_source_to_bank` — tok potvrde razlike

### Kod na disku
- **RPC:** `supabase/migrations/20260722185218_*.sql`
  - `preview_source_balance_after_batch(source_id, batch_id)` — vraća `{app_balance, bank_balance, delta, has_bank_row}` bez pisanja.
  - `align_source_to_bank(source_id, bank_balance, as_of)` — piše novo sidro `anchor_source='bank_reconciliation'` na `as_of + 1s` i postavlja `balance = round(bank_balance, 2)`. Idempotentno po zadnjem `anchor_audit` retku.
- **Queue / host:** `src/lib/reconciliation/queue.ts`, `src/components/ReconciliationDialogHost.tsx`.
- **Akcije:** `src/lib/reconciliation/actions.ts` (`alignToBank`, `keepMine`).
- **Executor punjenja queuea:** `src/lib/importReview/executor.ts` (poziva `preview_source_balance_after_batch` po sourceu i enqueue-a summary).
- **Resume banner:** `src/components/ReconciliationResumeBanner.tsx` (za `pending` state nakon zatvaranja).

### Odgovori na pitanja

1. **Prima li RPC bankin saldo i tiho ga postavlja, ili se korisniku prikaže razlika PRIJE potvrde?**
   - RPC `align_source_to_bank` **piše bez ikakvog internog upita**. Ali sam se **nikad ne poziva bez UI potvrde**. Tok je striktno dvofazan:
     1. Executor nakon importa poziva `preview_source_balance_after_batch` → dobije `{app, bank, delta}` i enqueue-a `ReconciliationQueueEntry`.
     2. `ReconciliationDialogHost` prikaže dijalog s tri retka (App/Banka/Razlika) i tri gumba (`Poravnaj s bankom` / `Zadrži moj saldo` / `Pregledaj transakcije`).
     3. Tek klik na "Poravnaj" (`handleAlign`) poziva `align_source_to_bank`.
   - Dakle: **razlika je uvijek prikazana prije poziva RPC-a.** RPC sam po sebi nema guard "jel korisnik vidio delta" (pretpostavlja klijenta koji je odradio preview), ali svi produkcijski pozivatelji to poštuju. Nema drugog callsitea.

2. **Gdje je UI ulaz?**
   - Primarno: `ReconciliationDialogHost` (globalno montiran u `App.tsx`), triggeran iz `ImportReview.handleConfirm` preko queuea.
   - Sekundarno (recovery): `ReconciliationResumeBanner` — nudi "Nastavi" za `pending` state (kad korisnik zatvori dijalog bez odluke).
   - Dijalog prikazuje `App: X€ / Banka: Y€ / Razlika: Z€` + naziv sourcea + opcijski warning "sidro novije od izvoda" (dayKey usporedba).

3. **Ostavlja li trag u `anchor_audit`?**
   - **Da**, kad se stvarno napravi align: `align_source_to_bank` upisuje red u `public.anchor_audit` s `anchor_source='bank_reconciliation'`, `old_*`/`new_*` vrijednostima, `reason='align_source_to_bank: user prihvatio bankin završni saldo za batch'` i `actor=auth.uid()`.
   - Dodatno: `alignToBank` klijent poziva `logDiagnostic('reconciliation_aligned', ...)`; `keepMine` loga `reconciliation_user_override` i piše per-source `user_override` u `imported_statements.reconciliation_meta.sources[sourceId]`.
   - "Keep mine" ne dira `anchor_audit` (jer se sidro ne mijenja) — trag je samo u `imported_statements` + diagnostic log. To je konzistentno.

**Zaključak A:** Tok zadovoljava audit zahtjeve (prikaz razlike + eksplicitna korisnička potvrda + trag). Jedina "otvorena" pozicija: RPC `align_source_to_bank` teoretski može biti pozvan mimo dijaloga s bilo kojom `p_bank_balance` vrijednošću — nema server-side provjere da vrijednost dolazi baš iz `preview_source_balance_after_batch`. To je threat model odluka (ovlašteni owner = može ručno postaviti sidro). Ako želiš tvrđi guard, može se dodati.

---

## B) Anchor-confirm za `anchor_source='migration'` — potvrda porijekla bez promjene salda

### Odgovori na pitanja

1. **Postoji li RPC ili UI koji dopušta korisniku da pregleda migracijski anchor i potvrdi ga?**
   - **Pregled: DA.** `src/components/custom-payment-sources/AnchorInfoSection.tsx` prikazuje trenutno sidro s porijeklom (`migration`, `system_initial`, `user_confirmed`, `bank_reconciliation`) + povijest iz `anchor_audit`.
   - **"Potvrda" gumb: DJELOMIČNO.** Kad je `anchor.source ∈ {migration, system_initial}` i postoji `onCorrectBalance` handler, prikaže se "Potvrdi stvarni saldo" (`anchor.confirmReal`) gumb koji **otvara Korekciju salda** (dijalog koji upisuje novi iznos).

2. **Ako postoji — mijenja li potvrda samo `anchor_source`, ili dira i saldo?**
   - **Dira i saldo.** "Confirm" gumb otvara postojeći correction dijalog koji poziva `set_source_anchor(source_id, anchor_ts, anchor_balance)` (migracija `20260722180051_*.sql`, korak 8). Ta RPC uvijek postavlja:
     - `correction_anchor_date = p_anchor_ts`
     - `correction_anchor_balance = p_anchor_balance`
     - `balance = p_anchor_balance`
     - `anchor_source = 'user_confirmed'`
   - Dakle nema pathwaya "potvrdi bez promjene". Korisnik mora tipkati (ili re-unijeti) iznos; ako je slučajno unese `bilo koji ≠ stari`, saldo se mijenja. Ako unese jednak, saldo se overwriteo istim brojem (no-op numerički, ali novi audit red).

3. **Ako NE postoji — potvrdi prazninu.**
   - **Praznina POSTOJI u obliku kakav audit traži:** nema RPC-a niti UI akcije koja bi samo prebacila `anchor_source: migration → user_confirmed` bez traženja/mijenjanja iznosa. Trenutno rješenje forsira korisnika kroz correction flow, što otvara rizik nenamjerne promjene salda i miješa dvije semantike ("potvrđujem da je migracijska vrijednost točna" vs "postavljam novi iznos").

**Zaključak B:** Pregled i UI ulazna točka postoje, ali audit-tražena semantika "acknowledge without value change" nije implementirana. Nema `confirm_migration_anchor` (ili sličnog) RPC-a; jedini put je kroz `set_source_anchor` koji uvijek piše i `balance`.

---

## Sažetak i mogući sljedeći koraci (SAMO za odluku, ne implementiram)

- **A) align tok:** ispunjava audit. Opcijski hardening: server-side re-check delte prije upisa (nova RPC koja interno poziva preview i odbije ako se `p_bank_balance` razlikuje od izračunatog `bank_balance` unutar batcha).
- **B) confirm-only praznina:** dva realna smjera:
  1. Nova RPC `confirm_migration_anchor(source_id)` — postavlja samo `anchor_source='user_confirmed'` + audit red s `old=new` (bez diranja `balance` / `correction_anchor_*`). Novi gumb "Potvrdi porijeklo" pored postojećeg "Ispravi saldo".
  2. Zadržati postojeće ponašanje i eksplicitno dokumentirati da je "confirm" == "korekcija" (audit trpi kompromis).

Reci koji smjer za B), i hoćeš li A) hardening ili ostaje kako je.
