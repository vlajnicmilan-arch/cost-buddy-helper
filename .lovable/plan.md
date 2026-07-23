Analiza prijedloga za dodavanje `recurrence_count` u `notifications` tablicu.

## Zaključak

Prijedlog je tehnički ispravan, ali postoji jedna kritična ispravka u logici `upsert_active_issue` i jedna odluka o semantici counta kojikada se issue ponovno aktivira nakon dismissed/resolved stanja.

## Detaljna analiza

### 1. Rupa u dismissed/reopen logici

Nema rupe u trenutnoj dismissed/reopen logici, **pod uvjetom** da se `recurrence_count` povećava na pravom mjestu.

Trenutna `upsert_active_issue` logika ima tri grane:
1. **Re-open** nakon 7-dnevne supresije (`status='active'`, resetira `dismissed_at`/`resolved_at`).
2. **Unutar supresije** — samo ažurira `last_seen_at` i `data`.
3. **Fresh insert** — novi redak.

Ako biếcurrence_count = recurrence_count + 1` stavite u opću UPDATE granu, count će rasti **svakih 30 sekundi** (svaki poziv `useIssueReconciler`) dok god je issue aktivan. To je glavna rupa.

Ispravno: count += 1 **samo u re-open grani** (gdje se redak vraća iz `dismissed` u `active`). U grani 2 (unutar supresije) count se ne smije dirati.

### 2. Je li `recurrence_count` korisna informacija ili tehnički šum?

Korisna je, ali **samo za warning/critical** i samo ako se prikaže diskretno.

- Za `critical`/`warning`: "Ovaj problem se ponovio 4×" je jasan signal da korisnik ne riješava uzrok.
- Za `info`: manje korisno — info issue-i su često jednokratni savjeti.
- Preporuka: prikazati badge samo ako `recurrence_count > 1`, uz tooltip ili tekst "Ponavlja se N. put".

Ako se prikaže bez konteksta (samo broj), postaje šum.

### 3. Reset vs akumulacija nakon resolved

**Preporuka: reset na 0 kada `resolve_stale_issues` postavi status='resolved'.**

Razlozi:
- `resolved` znači "problem je nestao". Ako se ponovno pojavi, to je nova epizoda.
- Reset daje korisniku jasniju sliku trenutnog stanja.
- Akumulacija kroz mjeseci/godine postaje nejasna ("ponovilo se 47×").
- Lakša implementacija — ne treba mijenjati SELECT u `upsert_active_issue` da uključuje i `resolved` retke.

Važna nijansa:
- `dismissed` nije "riješeno", nego "sakrij na 7 dana". Re-open nakon 7 dana unutar istog retka — count += 1.
- `resolved` je "riješeno". Sljedeći put se radi novi INSERT s count=0.

## Preporučena implementacija (ako se odlučite graditi)

1. **Migracija**: dodati `recurrence_count integer NOT NULL DEFAULT 0` na `notifications`.
2. **RPC `upsert_active_issue`**:
   - INSERT: `recurrence_count = 0` (implicitno default).
   - Re-open grana: `recurrence_count = recurrence_count + 1`.
   - Unutar-supresije grana: **bez promjene** counta.
3. **Frontend**:
   - `ActiveIssue` tip: `recurrence_count?: number`.
   - `useActiveIssues` select: uključiti `recurrence_count`.
   - `ActiveIssuesSection`: prikazati badge samo ako `recurrence_count > 1`.
   - Novi i18n ključevi za tooltip/opis.

## Otvorena pitanja prije gradnje

1. Želite li prikazivati count i za `info` severity, ili samo `warning`/`critical`?
2. Želite li akumulirati count kroz više resolved ciklusa (ukupno u povijesti), ili reset po ciklusu?
3. Želite li brojati i re-open nakon dismissed (preporuka: da), ili samo nakon resolved?

Bez ovih odgovora ne bih krenuo u implementaciju jer semantika counta direktno određuje SQL logiku.