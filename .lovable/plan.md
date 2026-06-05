## Brisanje Kruga uz suglasnost članova

### Trenutno stanje
- Ne postoji UI/RPC put za brisanje Kruga. `krug.deleted_at` kolona i `lifecycle_state='deleted'` postoje u shemi, ali nikad se ne postavljaju.
- U bazi ti stoje 2 testna Kruga ("Test", "Runtime test"), oba imaju **samo vlasnika** kao člana i **0 transakcija**. Nakon ovog patcha možeš ih obrisati kroz UI.

### Pravilo (jednostavno i sigurno)
- **Solo Krug** (vlasnik = jedini punopravni član): vlasnik briše odmah, bez glasanja.
- **Više punopravnih članova**: vlasnik pokreće **zahtjev za brisanje**. Svaki **punopravni** član (uključujući vlasnika) mora glasati "za". Obični članovi ne glasaju (nemaju governance prava ni inače).
- **Jedan glas "protiv" = zahtjev se otkazuje.** Vlasnik može u svakom trenutku povući zahtjev.
- Soft delete + 30 dana grace; pravi DB delete radi postojeći trash cron pattern (cleanup job).

### DB izmjene (jedna migracija)

```text
table krug_deletion_request
  krug_id           uuid PK → krug.id
  initiated_by      uuid → auth.users
  initiated_at      timestamptz default now()
  reason            text null
  status            text ('pending' | 'approved' | 'cancelled' | 'rejected')
  resolved_at       timestamptz null

table krug_deletion_vote
  krug_id           uuid → krug_deletion_request
  user_id           uuid
  approve           boolean
  voted_at          timestamptz default now()
  PRIMARY KEY (krug_id, user_id)
```

RLS:
- `krug_deletion_request` SELECT: bilo koji `krug_is_member` (transparentnost).
- INSERT: samo owner (`krug_is_owner`), i samo ako trenutno nema `pending` zahtjeva.
- `krug_deletion_vote` SELECT: `krug_is_member`. INSERT/UPDATE: samo trenutno glasujući user, i samo ako je `krug_is_full_member` na tom krugu, i samo dok je request `pending`.

RPC-i (svi `SECURITY DEFINER`, `FOR UPDATE` lock kao postojeći Krug RPC-i):
- `krug_request_deletion(p_krug_id uuid, p_reason text)` — owner-only. Ako je solo Krug → odmah soft-delete + outcome `ok_deleted_solo`. Inače kreira request, auto-upisuje vlasnikov "approve" glas, vraća `ok_request_created`.
- `krug_vote_deletion(p_krug_id uuid, p_approve boolean)` — punopravni član. Ako su svi trenutni punopravni glasovali "approve" → soft-delete + status='approved'. Ako bilo tko stavi "reject" → status='rejected', request zatvoren.
- `krug_cancel_deletion(p_krug_id uuid)` — owner povlači pending request.

Soft-delete učinak unutar RPC-a:
- `krug.deleted_at = now()`, `lifecycle_state='deleted'`
- Postojeći `useMyKrugs`/`useKrug` već filtriraju `deleted_at IS NULL` → Krug nestaje iz liste odmah.
- Transakcije (`expenses.krug_id`) ostavljamo netaknute — povijest svake osobe ostaje vidljiva kao personal (već imamo skeleton kompromis za `personal` privatnost).
- Shared payment sources se ne detach-aju eksplicitno; postaju nedostupni jer Krug više nije vidljiv (čisti se kroz purge).

Pravi DB purge: novi cron `cleanup-krug-deleted-daily` koji nakon 30 dana hard-deleta krugove sa `deleted_at IS NOT NULL AND deleted_at < now()-30d` (cascade na `krug_ownership`, `krug_membership`, `krug_shared_payment_source`, `krug_deletion_request/vote`).

### Frontend

Hookovi u `src/hooks/useKrugDeletion.ts`:
- `useKrugDeletionRequest(krugId)` — SELECT pending requesta + glasovi (vidi svaki član).
- `useKrugRequestDeletion()` / `useKrugVoteDeletion()` / `useKrugCancelDeletion()` — wrapper mutations s `showSuccess/showError` i invalidacijom `['krug','detail',krugId]` + `['krug','my']`.

UI u `KrugDetailScreen.tsx`:
- Novi destruktivni gumb **"Obriši Krug"** u header retku (samo owner). Otvara `KrugDeleteDialog`:
  - **Solo path**: jednostavan confirm "Obriši Krug 'X' — ova akcija premješta Krug u koš na 30 dana."
  - **Multi path**: textarea za razlog + objašnjenje "Brisanje zahtijeva suglasnost svih punopravnih članova (N/M glasova potrebno)".
- Novi `KrugDeletionVotePanel` (renderira se iznad članova ako postoji pending request):
  - prikazuje pokretača, razlog, listu punopravnih + status glasa (✓ / ✗ / čeka)
  - vlasnik: "Povuci zahtjev"
  - punopravni član koji nije glasao: "Odobri brisanje" / "Odbij"

i18n: nove ključeve `krug.delete.*` (HR/EN/DE): `cta`, `confirmSolo`, `confirmMulti`, `reasonLabel`, `requestCreated`, `votePanel.title`, `votePanel.approve`, `votePanel.reject`, `votePanel.withdraw`, `voteProgress`, `rejected`, `approvedAndDeleted`, `errors.*`.

### Memory
Dodati `mem://features/krug-deletion-flow` s pravilima (solo shortcut, unanimous full-member consent, 30d soft-delete grace, cron purge) i ažurirati `mem://index.md`.

### Testovi (vitest)
Novi `src/lib/krugDeletionDecisions.ts` + test fixture (slično `krugDecisions.ts`):
- solo owner → `ok_deleted_solo`
- owner + 1 punopravni, samo owner glasa → još `pending`
- svi punopravni "approve" → `ok_approved_and_deleted`
- bilo koji "reject" → `ok_rejected`
- obični član pokuša glasati → `not_eligible`
- non-owner pokuša pokrenuti → `not_owner`
- ponovljen zahtjev dok je pending → `request_already_pending`

### Što NE radim u ovom planu
- Ne brišem expenses retke (povijest ostaje).
- Ne diram governance act enum (A1/A2/A5 ostaju).
- Ne dodajem "hard delete now" admin override (može kasnije ako zatreba).
- Ne dodajem notifikacije/push za vote (može u Wave 2 ako bude potrebno).
