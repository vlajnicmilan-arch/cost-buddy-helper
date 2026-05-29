
# Family-shared payment source → auto Limited access

## Cilj
Kad vlasnik podijeli račun u obiteljsku grupu, svi članovi obitelji automatski dobiju **Limited** pristup na taj račun preko postojeće `payment_source_members` tablice. Vlasnik može kasnije podići pojedinog člana na **Full** kroz već postojeći Shared Wallet UI.

## Zašto Limited kao default
- Sigurno za djecu i nove članove (ne mogu mijenjati/brisati tuđe transakcije ni saldo)
- Nula friction-a za vlasnika kod dijeljenja
- Reuse postojeće infrastrukture — bez novih flowova
- Upgrade na Full je 1 klik kasnije

## Što se mijenja

### 1. Backend (migration)
Kad se red doda u `family_shared_payment_sources` (ili ekvivalent — provjeriti točan naziv u kodu), trigger:
- Za svakog `family_members.user_id` iz iste grupe → upsert u `payment_source_members` s `role = 'limited'`
- Skip ako član već postoji (ON CONFLICT DO NOTHING) — ne degradira postojeći `full` na `limited`
- Kad se novi član pridruži obitelji → trigger na `family_members` insertu također upiše `limited` za sve već-dijeljene račune te grupe
- Kad se račun makne iz dijeljenja → ukloni `limited` članstva (čuva `full` i `owner`)
- Kad član napusti obitelj → ukloni njegova family-derived članstva

### 2. Frontend
- **Nema novog UI-ja za biranje role pri dijeljenju** — samo "Podijeli s obitelji" toggle kao i sad
- Postojeći Shared Wallet ekran (gdje se već vide članovi i njihov pristup) ostaje jedino mjesto gdje vlasnik mijenja Limited ↔ Full po članu
- Sin (i ostali članovi) odmah vide račun u svom popisu izvora plaćanja s Limited oznakom

### 3. Provjere
- RLS na `payment_source_members` već radi → bez izmjena policy-ja
- `useCustomPaymentSources` već čita preko `is_payment_source_member` → bez izmjena hooka
- Balance updater već poštuje role → bez izmjena

## Što NE diramo
- Phase A transparency (attribution + activity feed) ostaje
- Direktan Shared Wallet flow (bez obitelji) ostaje nepromijenjen
- Family group UX (svi vide sve transakcije unutar grupe) ostaje
- Bez novih i18n ključeva osim eventualnog "Pristup preko obitelji" badge-a u članstvima

## Tehnički detalji
- Jedna migracija: 2 trigger funkcije (`sync_family_payment_source_members` na share/unshare, `sync_member_to_family_sources` na family_members insert/delete)
- Backfill: za sve postojeće family-shared račune odmah upisati `limited` članstva za sve trenutne članove (uključujući sina koji već čeka)
- Bez novih kolona, bez novih tablica

## Plan koraka
1. Pročitati točnu shemu (`family_shared_payment_sources`/`family_members`/`payment_source_members`) da potvrdim nazive
2. Napisati migraciju s 2 triggera + backfill INSERT
3. Provjeriti da Shared Wallet UI već prikazuje članove koji su došli "preko obitelji" (ako ne, dodati mali badge — i18n)
4. Test: sin treba odmah vidjeti račun nakon primjene migracije
