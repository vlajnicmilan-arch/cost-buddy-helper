
## Plan: Učiniti push sustav vidljivim i kad `send-push` uopće ne bude pozvan

### Što sam utvrdio
Trenutni logovi nastaju prekasno:
- `push_delivery_logs` se upisuje tek unutar funkcije `send-push`
- ako `_shared/sendPushNotification.ts` ne uspije napraviti HTTP poziv prema `send-push`, ne nastaje nikakav zapis
- zato korisnik može dobiti samo in-app obavijest iz `notifications`, a u push logu ostane potpuno prazno

Točno to objašnjava vaš slučaj: obavijest je spremljena u aplikaciju, ali nema ni pusha ni traga zašto ga nije bilo.

### Što ću napraviti
#### 1. Dodati “raniji” zapis pokušaja
Proširit ću praćenje tako da se zapis radi već u `_shared/sendPushNotification.ts`, prije poziva `send-push`.

Za svaki pokušaj zabilježit će se:
- kome se pokušalo poslati
- iz koje funkcije (`notify-project-transaction`, `notify-note-added`, itd.)
- naslov i tekst
- vrijeme pokušaja
- status poziva prema `send-push`:
  - `dispatch_started`
  - `dispatch_http_error`
  - `dispatch_network_error`
  - `dispatch_ok`

#### 2. Uvesti zajednički `request_id`
Svaki push pokušaj dobit će svoj `request_id` kako bismo mogli povezati:
- zapis iz helpera (`_shared/sendPushNotification.ts`)
- zapis iz `send-push`
- konačni FCM rezultat

Tako ćemo za jedan događaj vidjeti cijeli put:
```text
notify-project-transaction
  -> dispatch_started
  -> send-push reached
  -> tokens found / no tokens
  -> FCM success / error
```

#### 3. Nadograditi postojeću tablicu umjesto nagađanja po više mjesta
Umjesto da admin mora spajati više tragova ručno, proširit ću postojeći sustav logiranja tako da jedan zapis ili povezani zapisi pokrivaju obje faze:
- fazu slanja prema `send-push`
- fazu stvarnog slanja prema FCM-u

Ako bude čišće za pregled, dodat ću pomoćna polja poput:
- `request_id`
- `dispatch_status`
- `dispatch_error`
- `send_push_http_status`
- `lifecycle_stage`

#### 4. Ojačati `send-push` logove
Unutar `send-push` ću zadržati postojeće podatke i dopuniti ih s:
- potvrdom da je funkcija stvarno dosegnuta
- brojem tokena
- FCM ishodom
- razlogom ako nema tokena
- eventualnim cleanupom nevažećih tokena

#### 5. Doraditi Admin “Push Logs” tab
Admin prikaz ću pretvoriti iz običnog popisa u pravi dijagnostički pregled:
- jasno odvojene faze: “poziv krenuo”, “send-push dosegnut”, “FCM odgovor”
- crveni status ako je poziv pukao prije `send-push`
- žuti status ako nema tokena
- zeleni status ako je FCM prihvatio poruku
- filter po funkciji i korisniku
- prošireni detalji s greškom u ljudskom jeziku

#### 6. Dodati jasan fallback za “nema ni loga”
Ako helper ne uspije doći do `send-push`, to više neće ostati tiho:
- upisat će fallback zapis u bazu
- u adminu će se vidjeti da je problem bio prije same push funkcije

### Datoteke koje bih mijenjao
- `supabase/functions/_shared/sendPushNotification.ts`
- `supabase/functions/send-push/index.ts`
- nova migracija za proširenje logiranja
- `src/components/admin/PushLogsTab.tsx`
- po potrebi `src/pages/Admin.tsx`
- `src/i18n/locales/hr.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/de.json`

### Tehnički pristup
- zadržavam postojeći push mehanizam
- ne diram registraciju tokena dok ne dobijemo potpuni trag događaja
- ne diram korisnički flow za obične obavijesti u aplikaciji
- fokus je prvo na “observability”, da svaki neuspjeh ostavi trag

### Kako ćemo onda razlikovati kvarove
Nakon ove izmjene moći ćemo odmah vidjeti:
- obavijest stvorena, ali push helper nije ni uspio pozvati `send-push`
- `send-push` je pozvan, ali korisnik nema token
- token postoji, ali FCM vraća grešku
- FCM prihvati poruku, ali problem je na uređaju / Android kanalu / dozvolama

### Test nakon implementacije
1. Kreirati novu dijeljenu transakciju
2. Otvoriti Admin → Push Logs
3. Provjeriti da postoji zapis čak i ako push ne stigne
4. Vidjeti točnu fazu gdje je stalo
5. Po tome onda rješavati stvarni uzrok, bez nagađanja

### Očekivani rezultat
Nakon ovoga više nećemo imati situaciju “ništa nije stiglo i nema ničega u logu”. Svaki pokušaj će ostaviti trag, čak i kad sustav pukne prije stvarnog push slanja.
