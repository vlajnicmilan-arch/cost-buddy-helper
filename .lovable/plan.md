

## Provjera i dorada push obavijesti — puna pokrivenost svih segmenata

### Što već znam (iz koda i memorije)

Sustav koristi **FCM HTTP v1 API** s OAuth2/RS256 autentifikacijom. Tokeni se spremaju u `push_tokens` tablicu preko `usePushNotifications` hooka. Postoji **9 edge funkcija** koje šalju push notifikacije preko zajedničkog `_shared/sendPushNotification.ts`:

1. `notify-family-message` — chat poruke u obiteljskoj grupi
2. `notify-note-added` — bilješke dodane na transakciju
3. `notify-payment-source-transaction` — transakcija na dijeljenom računu
4. `notify-pending-transaction` — transakcija na odobrenju
5. `notify-project-transaction` — transakcija na projektu
6. `check-budget-alerts` — upozorenja kad se prijeđe budžet
7. `check-reminders` — podsjetnici (kalendar)
8. `check-milestone-deadlines` — rokovi faza projekta
9. `check-milestone-budgets` — preopterećenje proračuna milestonea
10. `trial-reminder` — podsjetnik o isteku probnog razdoblja
11. `broadcast-notification` — admin broadcast

### Plan provjere (3 koraka)

**Korak 1 — Tehnička provjera trenutnog stanja**
- Pregledat ću `_shared/sendPushNotification.ts` (kako se šalju notifikacije, OAuth, FCM v1 payload)
- Pregledat ću `usePushNotifications.ts` i `nativePush.ts` (registracija tokena, listeneri)
- Pregledat ću `push_tokens` shemu i `push_delivery_logs` (status isporuke)
- Provjerit ću svih 11 edge funkcija — koriste li ispravno `sendPushNotificationToMany` i imaju li `data.type` za routing
- Provjerit ću `capacitor.config.ts` (`PushNotifications` plugin postavke)
- Provjerit ću dohvaća li se token i sprema li se ispravno (potencijalni `onConflict` bug)

**Korak 2 — Funkcionalna analiza svih segmenata**
Provjerit ću pokriva li push sustav SVE relevantne događaje u aplikaciji:

| Segment | Trenutno stanje | Potrebna funkcija |
|---|---|---|
| Obiteljski chat | ✅ ima | `notify-family-message` |
| Bilješke na transakciji | ✅ ima | `notify-note-added` |
| Dijeljeni računi (transakcija) | ✅ ima | `notify-payment-source-transaction` |
| Pending odobrenja | ✅ ima | `notify-pending-transaction` |
| Projektne transakcije | ✅ ima | `notify-project-transaction` |
| Budžet — upozorenja | ✅ ima (cron) | `check-budget-alerts` |
| Kalendar podsjetnici | ✅ ima (cron) | `check-reminders` |
| Rokovi faza | ✅ ima (cron) | `check-milestone-deadlines` |
| Probno razdoblje | ✅ ima (cron) | `trial-reminder` |
| **Pozivnice (projekt/budžet/family/source)** | ❓ provjeriti | `respond-to-invitation` / `send-member-invitation` |
| **Prihvaćena pozivnica → vlasniku** | ❓ provjeriti | `accept-project-invitation` |
| **Nova ponavljajuća transakcija auto-generirana** | ❓ provjeriti | `match-recurring` |
| **Detektiran zajam/dug** | ❓ provjeriti | `detect-loans` |
| **Ažuriranje tečaja kad utječe na saldo** | ❓ vjerojatno ne treba | — |
| **Push na tap → navigacija u app** | ❓ provjeriti `pushNotificationActionPerformed` listener | — |
| **Push delivery logging i admin pregled** | ❓ provjeriti | — |
| **Web push (PWA, ne samo nativno)** | ❌ trenutno samo nativno | nedostaje VAPID flow |

**Korak 3 — Live test**
- Pozvat ću `broadcast-notification` da pošaljem testnu obavijest na vaš token i provjerim isporuku
- Pregledat ću `push_delivery_logs` posljednjih 24h za stvarnu uspješnost
- Pregledat ću edge function logs (`send-push`, `notify-*`) na greške

### Što očekujem da ću trebati popraviti (na temelju iskustva)

1. **Tap-to-navigate** — `pushNotificationActionPerformed` trenutno samo logira, ne navigira na relevantni ekran (transakcija/projekt/chat). Dodati routing iz `notification.data`.
2. **Pozivnice nemaju push** — kad netko pozove korisnika u projekt/budžet/family/dijeljeni račun, šalje se samo email + in-app notifikacija. Dodati push.
3. **Auto-generirane recurring transakcije** — `match-recurring` možda ne šalje push pri kreiranju. Provjeriti.
4. **Detect-loans** — kad AI detektira novi zajam, push prijedlog korisniku.
5. **Token rotacija / cleanup** — provjeriti briše li se nevažeći token nakon FCM `UNREGISTERED` greške (inače se gomilaju mrtvi tokeni).
6. **PWA web push** — trenutno radi samo na nativnom Androidu. Za korisnike koji koriste PWA na desktopu/iOS Safariju, dodati Web Push (VAPID) ako je u opsegu.
7. **Per-user toggle** — provjeriti ima li korisnik mogućnost u Postavkama uključiti/isključiti pojedinu kategoriju (chat, budžet, podsjetnici…). Ako ne — dodati.
8. **Zvuk/badge sync** — provjeriti čisti li se badge nakon `markAllAsRead`.

### Što ću isporučiti nakon plana

1. **Detaljan dijagnostički izvještaj** s točnim popisom:
   - što radi
   - što je djelomično
   - što nedostaje
   - što ima bug
2. **Implementacija ispravaka** (po prioritetu, jedan po jedan, da možete testirati):
   - **P0 (kritično)**: tap-to-navigate, token cleanup
   - **P1 (visoko)**: push za pozivnice, recurring auto-gen, loan detection
   - **P2 (srednje)**: per-user toggle u Postavkama, PWA web push
   - **P3 (nice-to-have)**: admin pregled push uspješnosti u Pulse tabu

### Što trebam od vas

Prije nego krenem implementirati popravke, samo potvrdite dvije stvari:

- **a)** Želite li da pokrijem i **PWA Web Push** (za korisnike koji ne koriste Android nativnu aplikaciju), ili samo nativno?
- **b)** Želite li **per-user toggle** po kategorijama u Postavkama (npr. "isključi push za chat"), ili je dovoljno globalno on/off?

Ako kažete "kreni s defaultima" — pretpostavit ću **da** za oboje i krenuti redom od P0 prema P3.

