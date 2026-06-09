---
name: All project pushes batched at 19h
description: Svi push-evi za projektne i dijeljene aktivnosti odgođeni do 19h digesta; iznimke su pozivnice, budget alerti, vlastiti reminderi
type: feature
---

Donesena odluka 9.6.2026 nakon korisničke pritužbe na buku obavijesti.

## Pravilo
Sve projektne i dijeljene aktivnosti šalju **samo in-app notifikaciju (zvonce) odmah**, a push (banner na zaključanom ekranu) se ne šalje. Push fan-out se obavlja kroz `flush-participant-digest` u lokalni 19h korisnika (default Europe/Zagreb, configurable u `notification_preferences.participant_digest_hour`).

## Edge funkcije bez instant push-a (samo enqueue + in-app)
- `notify-project-transaction`
- `notify-project-activity`
- `notify-note-added` (sve tri grane: project / income_source / payment_source)
- `notify-payment-source-transaction` (samo in-app, BEZ digesta — payment source nije pokriven postojećim digest scope-om; iteracija 2 ako bude potrebno)

Sloj "Projects subscriber → instant push" je uklonjen. `splitInstantVsDigest` helper više nije pozvan iz ovih funkcija (helper datoteka ostavljena za eventualni budući use case).

## Iznimke koje OSTAJU instant
- `send-member-invitation`, `respond-to-invitation`, `accept-project-invitation` — pozivnice.
- `check-budget-alerts`, `check-milestone-budgets` — prekoračenje budžeta.
- `check-reminders` — vlastiti podsjetnici korisnika.
- `notify-pending-transaction` — vlasnik kruga mora odobriti transakciju (blokira tijek).
- `notify-app-update`, `broadcast-notification`, `activation-nudge` — sistemski.

## Osobne financije
Dnevni summary u 21h ostaje nepromijenjen (`Daily Summary Push`).

## Što se NIJE promijenilo
- `notifications` tablica insert odmah (in-app zvonce radi).
- `enqueue_participant_digest_event` poziv ostaje u svim projektnim funkcijama.
- Schema je netaknuta.
