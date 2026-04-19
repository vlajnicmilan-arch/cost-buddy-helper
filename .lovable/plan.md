

## Plan: Popravak push obavijesti — funkcije nisu deployani s novim kodom

### Dijagnoza (potvrđeno iz logova)

1. **In-app notifikacije rade** — u `notifications` tablici postoje nove zapisi (npr. "Transakcija u projektu Duje Grčić" u 13:39)
2. **`notify-project-transaction` se uspješno poziva** (HTTP 200, 1042ms execution)
3. **ALI `send-push` nema NIJEDAN log** — što znači da `sendPushNotification(...)` poziv unutar deployanih funkcija **nikad ne pošalje HTTP zahtjev**
4. **Korisnik IMA registriran token** u `push_tokens` (1 zapis, Android)

### Uzrok

Edge funkcije referenciraju `import { sendPushNotificationToMany } from '../_shared/sendPushNotification.ts'`. Kod je u repo-u **ispravan**, ali deployani build vjerojatno ne uključuje `_shared/` helper iz dva moguća razloga:

- **Najvjerojatnije**: funkcije nisu redeployani nakon dodavanja shared helpera. Promjena `_shared/sendPushNotification.ts` ne triggera automatski redeploy onih 13 funkcija koje ga uvoze (jer se redeployaju samo funkcije čiji se `index.ts` mijenja).
- **Manje vjerojatno**: deploy bundler ne pokupi datoteke iz `_shared/` (no Supabase normalno pokupi relativne importe)

### Rješenje

**Force redeploy svih 13 notifikacijskih funkcija** koje koriste push helper, koristeći `supabase--deploy_edge_functions`:

1. `notify-project-transaction`
2. `notify-payment-source-transaction`
3. `notify-pending-transaction`
4. `notify-note-added`
5. `notify-family-message`
6. `broadcast-notification`
7. `check-reminders`
8. `check-budget-alerts`
9. `check-milestone-deadlines`
10. `send-member-invitation`
11. `accept-project-invitation`
12. `respond-to-invitation`
13. `track-referral`

Plus za sigurnost i sam `send-push`.

### Dodatne provjere nakon redeploya

Nakon redeploya, trigerirati testnu transakciju i provjeriti:
- `send-push` logove — mora se pojaviti `Listening` + uspješna FCM poruka
- Da li FCM vrati `OK` ili neku grešku (npr. neispravan token, pogrešan project_id)

### Što NE diram

- Frontend kod (radi ispravno)
- `_shared/sendPushNotification.ts` (kod je točan)
- `usePushNotifications.ts` / `nativePush.ts` (token je registriran)
- `push_tokens` tablicu i RLS

### Test plan nakon deploya

1. Iz drugog uređaja/računa kreirati transakciju na dijeljenom računu korisnika `e78ee9bd-094e...`
2. Provjeriti `send-push` logove — mora postojati zapis o pozivu na FCM
3. Provjeriti dolaze li push obavijesti **na zaključan ekran s zvukom** na Androidu

