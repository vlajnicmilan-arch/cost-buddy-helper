

User wants Croatian. Confirmed status: secrets list shows NO `FCM_SERVICE_ACCOUNT` and NO `FCM_SERVER_KEY`. Memory says we should be on FCM HTTP v1 with OAuth2/RS256. Need to check push_tokens table existence and where register is called.

Key gaps:
1. No FCM credentials at all → push se ne može slati
2. send-push koristi LEGACY API (deprecated lipanj 2024)
3. Trebam provjeriti je li `usePushNotifications.register()` ikad pozvan

## Stanje Push obavijesti — pregled

### Što JE napravljeno ✅
- **Frontend hook**: `src/hooks/usePushNotifications.ts` — registrira FCM token, sprema u `push_tokens` tablicu
- **Edge funkcija**: `supabase/functions/send-push/index.ts` — šalje notifikaciju
- **Capacitor config**: `PushNotifications` plugin konfiguriran u `capacitor.config.ts`
- **Pozivajuća logika**: `check-milestone-deadlines` već zove `send-push` kad faza istječe
- **Toggle u postavkama**: `pushEnabled` switch postoji u `NotificationsSection.tsx`

### Što NEDOSTAJE ❌ (3 kritična problema)

**1. Nema FCM kredencijala u Secrets**
Provjerio sam — nema ni `FCM_SERVER_KEY` ni `FCM_SERVICE_ACCOUNT`. Bez toga edge funkcija vraća error `"FCM_SERVER_KEY not configured"` i nijedna obavijest se ne šalje.

**2. `send-push` koristi DEPRECATED API**
Kod koristi `https://fcm.googleapis.com/fcm/send` (Legacy API) koji je Google **ugasio u lipnju 2024**. Treba migrirati na **FCM HTTP v1** (`https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`) koji koristi OAuth2 s service account JSON-om (RS256 JWT).

**3. `register()` se vjerojatno nikad ne poziva**
Hook postoji ali ga moram provjeriti — treba se pozvati nakon što se korisnik prijavi i nakon što uključi push toggle. Inače token nikad ne dođe u bazu.

**4. Nedostaje `google-services.json` u Android projektu**
Bez toga Firebase ne može izdati FCM token na uređaju.

---

## Plan: Kompletiranje Push obavijesti

### Korak 1: Ti napraviš Firebase setup (jednom, ~15 min)
1. Idi na https://console.firebase.google.com → kreiraj projekt "V&M Balance" (ili koristi postojeći)
2. **Add app → Android** → package name: `app.lovable.costbuddy`
3. Skini `google-services.json` → spremi u `android/app/google-services.json` lokalno
4. **Project Settings → Service accounts → Generate new private key** → skini JSON file (to je `FCM_SERVICE_ACCOUNT`)
5. Kopiraj cijeli sadržaj tog JSON-a → spremit ćeš u Lovable Cloud kao secret

### Korak 2: JA napravim (kod izmjene)
- **Migrirati `send-push/index.ts`** s Legacy API na FCM HTTP v1:
  - Parse service account JSON iz secreta
  - Generirati OAuth2 access token (RS256 JWT → razmijena za Bearer token)
  - Slati POST na `v1/projects/{project_id}/messages:send` s pravom strukturom
- **Tražit ću tebe da dodaš secret** `FCM_SERVICE_ACCOUNT` (cijeli JSON service accounta)
- **Provjeriti i pozvati `usePushNotifications.register()`** na pravom mjestu (vjerojatno u `App.tsx` ili nakon login-a kad je `pushEnabled === true`)
- **Dodati `push_tokens` tablicu** ako ne postoji (s RLS politikama)
- **Test endpoint** za slanje test obavijesti iz UI-ja (gumb "Pošalji test push" u Postavkama)

### Korak 3: Ti napraviš lokalno (uz onaj APK build)
- Stavi `google-services.json` u `android/app/`
- Provjeri da `android/build.gradle` ima Google Services plugin (Capacitor sync to obično dodaje, ali možda treba ručno)
- `npx cap sync android` → build APK → instaliraj

### Što ću točno mijenjati u kodu
- `supabase/functions/send-push/index.ts` — kompletno prepisati za FCM v1 API
- `src/App.tsx` ili `src/hooks/useAuth.ts` — pozvati `register()` nakon login-a
- `src/components/settings/NotificationsSection.tsx` — kad korisnik uključi push toggle, pozvati `register()`; kad isključi, `unregister()`
- Migracija — kreirati `push_tokens` tablicu ako ne postoji + RLS
- (Opcionalno) gumb za test push u admin panelu

### Što odgađamo za kasnije
- Slanje pusha za druge događaje (nove transakcije, podsjetnici, family chat) — to dodajemo postupno nakon što osnovni flow radi

