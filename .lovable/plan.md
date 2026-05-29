
## Cilj

Trenutno su `member` i `viewer` u Obitelji **identični** — oba prolaze kroz `is_family_member()` i dobivaju `limited` na dijeljenim izvorima preko `fm_grant_limited_on_join` trigera. Promatrač je dekorativan i ne radi ništa drugačije od člana. Cilj: tri jasno različite razine.

## Konačna semantika uloga

| Uloga | Vidi dijeljene transakcije (sve, i tuđe) | Dodaje na dijeljene izvore | Mijenja/briše tuđe | Upravlja grupom |
|---|---|---|---|---|
| **Vlasnik** (`owner`) | Da | Da | Da | Da |
| **Član** (`member`) | Da | Da | Ne (samo svoje) | Ne |
| **Promatrač** (`viewer`) | Da | Ne | Ne | Ne |

Ključna promjena: **član sad vidi i tuđe transakcije na dijeljenom izvoru** (sad vidi samo svoje — bug koji je krenuo cijelu raspravu). Promatrač dobiva istu vidljivost ali bez prava unosa.

## Backend (migracije)

1. **Novi role na `payment_source_members`**: dodaj `'viewer'` uz postojeće `'full'` i `'limited'`.
2. **`fm_grant_limited_on_join` trigger** — preimenovati logiku tako da gleda `family_members.role`:
   - `owner` → ostaje izvan (vlasnik izvora već ima sve)
   - `member` → `limited` (kao sad)
   - `viewer` → `viewer` (novo)
3. **`fss_grant_limited_on_share` trigger** — ista logika po roli člana.
4. **RLS na `expenses`** (ovo je srž popravka):
   - Trenutno `limited` član vidi SELECT samo vlastite retke na dijeljenom izvoru.
   - Nova politika: ako je izvor dijeljen i korisnik je `limited` **ili** `viewer` član tog izvora → SELECT sve transakcije na tom izvoru.
   - INSERT/UPDATE/DELETE i dalje: `viewer` = zabranjeno, `limited` = INSERT da, UPDATE/DELETE samo vlastite, `full`/owner = sve.
5. **Helper funkcija** `public.payment_source_role(_source_id, _user_id) returns text` (SECURITY DEFINER) — vraća `'owner' | 'full' | 'limited' | 'viewer' | null`, koristi se i u RLS i u UI.

## Frontend

1. **`FamilyRole` tip** u `src/types/family.ts` — već postoji `owner | member | viewer`, samo se počinje stvarno koristiti.
2. **Family UI (`FamilyMembersList` / invite dialog)** — već nudi izbor uloge; dodati jasan opis ispod svake opcije (i18n).
3. **`useFamilyMembers` / `usePaymentSourceMembers`** — proširiti rezultat da vraća efektivnu rolu (`owner | full | limited | viewer`).
4. **Guard na unos transakcija**:
   - `AddExpenseDialog` / izbornik izvora plaćanja: ako je korisnik `viewer` na izvoru → izvor je vidljiv u listi ali disabled s tooltipom "Samo pregled".
   - Skriti FAB "Dodaj transakciju" ako korisnik nema niti jedan izvor na koji smije pisati.
5. **i18n** (`hr`, `en`, `de`) za nove tekstove: `family.roles.viewer.description`, `family.roles.member.description`, `paymentSource.viewerCannotAdd`.

## Push obavijesti

`notify-family-transaction` već postoji — provjeriti da fire-a i za `viewer` i za `member` (oba trebaju primati push o novoj zajedničkoj transakciji). Ako trenutno fire-a samo prema `is_family_member()` to već pokriva oba.

## Validacija

- Vlasnik doda transakciju na dijeljeni Revolut → Petar (`member`) je vidi i dobiva push.
- Promotaj Petra u `viewer` → i dalje vidi sve, ali "Dodaj" je disabled na Revolutu.
- Promatrač pokuša POST na `expenses` s `payment_source='custom:<shared>'` → RLS odbija (403).
- Postojeći podaci: `viewer` zapisi u `family_members` (ako ih ima) automatski rade prema novoj semantici nakon migracije, bez ručnog backfilla.

## Što NIJE u opsegu

- Per-transakcijske dozvole (npr. "vidi sve osim transakcija označenih kao privatne") — preskačemo, kompleksno.
- Granularne dozvole "može uređivati tuđe" — `member` može mijenjati samo svoje, kraj.
- Notifikacijske postavke po roli — koristi postojeću `notification_preferences`.

## Memorija

Nakon implementacije, ažurirati `mem://features/family-and-collaboration-system` da reflektira tri stvarne razine i dodati `mem://features/shared-wallet-role-permissions` napomenu o `viewer` roli na `payment_source_members`.
