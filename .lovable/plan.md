# Krug — obavijest autoru o ishodu prijedloga: dijagnoza isporuke i plan popravka

## Dijagnoza isporuke (samo čitanje, 24.9.2026.)

### 1. Zapisi serverske funkcije
- `supabase--edge_function_logs` za `notify-krug-event`: **nema nijednog zapisa** (ni boot, ni poziv) u dostupnom prozoru.
- Analitički zapisi (`function_edge_logs`) za `notify-krug-event`: **0 redaka**, i za 24.9. 17:30–18:10 i za cijeli dostupni raspon. Drugim funkcijama zapisi postoje, pa prozor nije prazan općenito.
- `net._http_response` za 24.9.: istekao (čuva se 24 h) — ne mogu provjeriti je li HTTP poziv uopće stigao.
- Zaključak: za dva propuštena čina **ne postoji nikakav trajni trag** ni na strani emit funkcije ni na strani notify funkcije. To je samo po sebi nalaz.

### 2. `krug_emit_notification` (živa definicija, provjerena)
- Poziv: `net.http_post(url, headers, body)` — **bez `timeout_milliseconds`** (pg_net zadani timeout je kratak, red veličine ~2 s) i bez provjere povratnog `request_id`.
- Ključ dolazi iz vaulta (`krug_notify_internal_key`); ako nedostaje: `RAISE WARNING` i tihi izlaz — bez zapisa.
- Ako `net.http_post` baci iznimku: **nema EXCEPTION bloka** — iznimka se penje u `krug_apply_act` i može srušiti cijeli čin potvrde/odbijanja (rollback).
- Ako HTTP poziv kasnije ne uspije (timeout, 4xx/5xx): jedini trag je `net._http_response`, koji istječe za 24 h. U `app_diagnostics_logs` se ne piše ništa.
- `net.http_post` je asinkron: emit ne saznaje ishod isporuke.

### 3. Dedup u `notify-krug-event`
- Dedup je po `user_id + type + data @> {dedup_ref}` — točno podudaranje JSON sadržaja, **nema prefiksnog uspoređivanja**; `dedup_ref` nosi jedinstveni `krug_act_dedup.id` po činu (`krug_expense_confirmed:act:<dedup_id>`). Lažni dedup-pogodak između različitih činova **nije moguć**.
- Preference gate: `is_push_category_enabled(user, 'krug')` — Milan ima `krug_enabled: true`; osim toga, Milan je za čin u 17:49 obavijest **zapravo primio**, pa preference nisu uzrok.

### 4. Širi pregled (30 dana)
- `krug_act_dedup` (cijela tablica): 3 uspješna A1 čina, sva 24.9. 17:44–17:53; A2: 0, A5: 0.
- Obavijesti `krug_expense_*` u 30 dana: 2 retka, oba 24.9. (confirmed 17:49:42 → Milan; proposed 17:52:47 → Milan).
- Starije obavijesti (8.8.: 3 confirmed + 3 rejected) nemaju odgovarajuće retke u `krug_act_dedup` — tada je drugačiji izvor emitirao; nisu mjerljive ovim spojem.
- **Isporuka A1 u 30 dana: 1/3 (33 %).** Propušteno: 17:44:31 (00541759…, autor Milan) i 17:53:06 (d6ce9aee…, autor Petar). Dostavljeno: 17:49:38 (25711e43…).
- Zanimljivo: između dva propuštena čina jedan je prošao — isporuka je povremena, ne potpuno pokvarena.

### 5. Vjerojatan uzrok
- Emit radi `net.http_post` bez timeouta i bez ikakve povratne provjere. Kad HTTP poziv ne uspije (hladni start funkcije, kratki pg_net timeout, mrežni prekid), čin je već zapisan u `krug_act_dedup`, obavijest se više **nikad ne pokušava**, a trag nestaje za 24 h. Uzrok pojedinačnog propuštanja ne mogu dokazati (tragovi istekli), ali arhitektura jamči da je svaki promašaj **tihan i neoporavljiv**.
- Sekundarni rizik: iznimka iz `net.http_post` penje se u `krug_apply_act` bez zaštite.

## Plan popravka (za odobrenje; gradnja tek nakon naloga)

1. **Trag neuspjeha (obavezno):** u `krug_emit_notification`:
   - umotati cijeli emit u EXCEPTION blok (uzorak 0016) — obavijest nikad ne ruši čin;
   - postaviti `timeout_milliseconds` (npr. 5000);
   - pohraniti `request_id` iz `net.http_post`;
   - zapisati u `app_diagnostics_logs` događaj `krug_emit_queued` (dedup_ref, krug_id, event_type, request_id, verzija funkcije) i pri iznimci `krug_emit_error` (code, message, build stamp).
2. **Provjera ishoda i ponovni pokušaj:** lagani cron (npr. svakih 5 min) ili proširenje postojećeg drain mehanizma: za redke iz `krug_act_dedup` (A1/A2/A5, outcome `ok*`) bez odgovarajuće obavijesti starije od ~2 minute, ponovno pozvati emit (dedup u notify funkciji sprječava dvostruku obavijest). Ishod HTTP poziva čitati iz `net._http_response` dok je svjež; neuspjeh (status ≥ 400 ili error_msg) zapisati u `app_diagnostics_logs` kao `krug_emit_failed`.
3. **Ukloniti `detectAuthorOutcome`** iz `useExpenseFetch` (uvijek vraća `null`; uz REPLICA IDENTITY FULL jednog dana stvorio bi dvostruki signal) — zajedno s `src/lib/krugAuthorOutcome.ts` i njegovim testom; toast ključeve ukloniti iz hr/en/de ako se ne koriste drugdje.
4. **Testovi:**
   - SQL čuvar (ROLLBACK): A1/A2 emitiraju točno jednom po novom činu; ponovljeni `client_request_id` ne emitira; iznimka u emitu ne ruši `krug_apply_act`; zapis u `app_diagnostics_logs` nastaje pri grešci.
   - vitest: čuvar da `useExpenseFetch` više ne sadrži toast ishoda; postojeći `krugNotificationPayload`/route testovi ostaju.

Bez promjene REPLICA IDENTITY, bez novog okidača na `expenses`, bez diranja saldo logike. Migracija je zaseban nalog; ne objavljivati.
