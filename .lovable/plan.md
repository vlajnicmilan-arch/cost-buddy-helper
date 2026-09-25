# Krug — obavijest autoru o ishodu prijedloga: dijagnoza i plan

## Glavni nalaz
Serverska obavijest autoru **već postoji** (varijanta b). Pretpostavka iz naloga 1 žive salde, da autor ništa ne dobiva, nije točna. Ne radi samo klijentski rezervni toast `detectAuthorOutcome`.

## 1. Tok prijedloga (provjereno)
- Stupci na `expenses`: `krug_id`, `krug_privacy = 'shared'`, `krug_shared_status` (`predlozena` -> `potvrdjena` / `nepotvrdjena`) i `krug_reject_reason`.
- Stanje u bazi: 2 u statusu predlozena, 20 potvrdjena i 15 nepotvrdjena.
- Potvrdu i odbijanje radi jedan RPC: `krug_apply_act(p_expense_id, p_act, p_client_request_id, p_reason)`. Potvrda je A1, odbijanje A2 i obvezno traži razlog. A5 je ponovni prijedlog.
- Idempotentnost osigurava `krug_act_dedup`. Obavijest se šalje samo kad je dedup redak nov i kad se status stvarno promijenio.
- Nakon toga RPC zove `krug_emit_notification`:
  - A1 šalje `krug_expense_confirmed`, a A2 šalje `krug_expense_rejected` s `vars.reason`;
  - primatelj je samo autor: `recipient_override = ARRAY[_exp.user_id]`;
  - `dedup_ref` ima oblik `krug_expense_<x>:act:<dedup_id>`.
- `krug_emit_notification` šalje `net.http_post` na `notify-krug-event` s internim ključem iz vaulta. Ta funkcija:
  - provjerava ključ;
  - radi dedup po `data->>dedup_ref`;
  - upisuje redak u `notifications`;
  - šalje push kroz `send-push`.
- Isporuka radi: zadnja `krug_expense_confirmed` obavijest upisana je 24.9.2026. u 17:49.
- Neprovjereno: `krug_act_dedup` ima 3 uspješna A1 čina, zadnji 24.9. u 17:53. Od 24.8. vidim samo jednu confirmed obavijest. Moguće je da je dio isporuka izostao. To je prvi korak plana.
- Klijentsko mjesto na kojem se čin pokreće nisam otvarao.

## 2. Što je `detectAuthorOutcome` trebao prikazati
- Kratku poruku na ekranu, bez rute i bez zvuka:
  - `showSuccess(notifications.krug.expense_confirmed.toast)`;
  - `showError(notifications.krug.expense_rejected.toast)`.
- Nalazi se u `useExpenseFetch.ts`, oko reda 667, u obradi UPDATE događaja.
- Komentar u kodu kaže da je to jedini kanal „dok notify-krug-event ne dostavlja". To više nije točno.

## 3. Varijante
- **(b) Poziv iz RPC-a: već izgrađeno.** Ima dedup po činu, ne javlja autoru za vlastiti čin, prava provjerava RPC, push ide postojećim putem, a tekstovi postoje u registru obavijesti.
- **(a) Okidač AFTER UPDATE na `expenses`: ne preporučujem.**
  - Duplirao bi postojeći put i trebao bi dodatni dedup ključ `krug_outcome:<id>:<status>`.
  - Okidao bi se i na promjene koje ne dolaze iz RPC-a.
  - Dodao bi okidač na tablicu na kojoj je saldo osjetljiv, a to traži SQL paket salda.
- Preporuka: ne graditi novi put. Ostaje (b).

## 4. `detectAuthorOutcome`
- Preporuka: ukloniti poziv iz `useExpenseFetch`, zajedno s importom i zastarjelim komentarom.
- Ukloniti i `src/lib/krugAuthorOutcome.ts` s njegovim testom.
- Danas uvijek vraća `null`. Kad bi netko jednom uključio REPLICA IDENTITY FULL, isti događaj bi autor dobio dva puta.
- Ključeve `notifications.krug.expense_*.toast` treba provjeriti. Ako se ne koriste nigdje drugdje, uklanjaju se iz hr/en/de.

## 5. Nalog za gradnju
1. Provjera bez izmjena: za svaki uspješan A1/A2 u `krug_act_dedup` postoji li obavijest s odgovarajućim `dedup_ref`. Uz to pregled zapisa `notify-krug-event` i `net._http_response` za propale pozive. Ako isporuka izostaje, to je zasebna dijagnoza.
2. Ukloniti `detectAuthorOutcome`, kako je opisano u točki 4.
3. Testovi:
   - vitest: čuvar u izvornom kodu da `useExpenseFetch` više ne prikazuje toast ishoda;
   - SQL čuvar, proširenje `supabase/tests/krug/reject_reason.sql` ili nova datoteka:
     - A1 i A2 zovu emit točno jednom po novom činu;
     - ponovljeni `client_request_id` ne zove ponovno;
     - A5 ne javlja autoru.
   - Emit se provjerava zamjenskom funkcijom unutar ROLLBACK-a.
   - Postojeći `krugNotificationPayload` i route testovi ostaju.

Nema migracije i ne dira se baza. Ne objavljuje se bez posebnog naloga.
