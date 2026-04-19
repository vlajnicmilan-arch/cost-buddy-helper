

## Plan: Push obavijesti za sve notifikacije

### 1. Shared helper
**Nova datoteka**: `supabase/functions/_shared/sendPushNotification.ts`
- Funkcija `sendPushNotification({ supabase, user_id, title, body, data })`
- Interno zove `send-push` edge funkciju preko `supabase.functions.invoke`
- Try/catch — push je best-effort, in-app notifikacija ne smije pasti zbog push greške
- Loga grešku ali ne baca

### 2. Ažuriranje 12 edge funkcija
Nakon `INSERT INTO notifications`, dodati `await sendPushNotification(...)`:

| Funkcija | Trigger | Push poruka |
|---|---|---|
| `check-reminders` | Cron na due reminders | Naslov podsjetnika |
| `check-budget-alerts` | Cron na budget thresholds | Budget alert |
| `notify-family-message` | Nova chat poruka | "{ime} u {grupa}" + truncated content |
| `notify-note-added` | Nova bilješka uz transakciju | Note preview |
| `notify-payment-source-transaction` | Transakcija na dijeljenom računu | Iznos + opis |
| `notify-pending-transaction` | Pending čeka odobrenje | Submitter + iznos |
| `notify-project-transaction` | Transakcija na projektu | Iznos + projekt |
| `accept-project-invitation` | Korisnik prihvatio poziv | Tko se pridružio |
| `auto-reject-pending` | Cron auto-reject | "Auto odbijena" |
| `broadcast-notification` | Admin broadcast | Custom |
| `respond-to-invitation` | Odgovor na pozivnicu | Status |
| `send-member-invitation` | Slanje pozivnice | Pozivnica primljena |

Za multi-recipient funkcije (broadcast, family-message): petlja po user_id, jedan push poziv po korisniku.

### 3. UI hint za web korisnike
**Izmjena**: `src/components/settings/NotificationsSection.tsx`
- Detektirati nije-native (`!Capacitor.isNativePlatform()`)
- Ispod prekidača za push: mali muted text s ključem `settings.pushNotificationsWebHint`

### 4. i18n
Dodati u `hr.json`, `en.json`, `de.json`:
- `settings.pushNotificationsWebHint` → "Push obavijesti dostupne su u Android aplikaciji" / "Push notifications are available in the Android app" / "Push-Benachrichtigungen sind in der Android-App verfügbar"

### Što NE diram
- `send-push` edge funkciju (radi)
- `nativePush.ts`, `usePushNotifications.ts` (radi)
- `push_tokens` tablicu i RLS
- realtime in-app notifikacije
- nativni build (nije potreban)

### Test plan nakon deploya
1. Otvoriti app na Androidu
2. Settings → uključiti push (već uključeno ako je ranije postavljeno)
3. Triggerati 2-3 različite obavijesti (chat poruka, podsjetnik, transakcija na dijeljenom računu)
4. Provjeriti dolaze li na zaključan ekran

