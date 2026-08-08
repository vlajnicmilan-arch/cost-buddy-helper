# Nalaz: sirovi i18n ključevi u sistemskim (push) obavijestima

## 1. Koji put je opalio danas — dokazano

Oba slučaja su **server push** (send-push → FCM), ne klijentski `showNotification`.
Iz `push_delivery_logs`:

```
2026-08-08 09:37:17 UTC  notify-krug-event  fcm  fcm_success  title=notifications.krug.invitation_accepted.title
2026-08-08 15:15:15 UTC  notify-krug-event  fcm  fcm_success  title=notifications.krug.member_left.title
```

Kontrola iz istog dana, isti put, isti izvor:

```
2026-08-08 09:04:13 UTC  notify-krug-event  fcm  fcm_success  title=Krug je obrisan
```

Dakle put radi i prevodi — ali ne za sve ključeve.

## 2. Gdje se gubi prijevod

Lanac je već dizajniran za prijevod na serveru:

- `notify-krug-event` u payload stavlja `data.i18n_title_key` / `i18n_body_key` + `title_vars` / `message_vars` (a u `notifications` redak sprema ključ — namjerno).
- `send-push` (linije 333–354) čita `profiles.preferred_language`, pa zove `translate(lang, key, vars)` iz `supabase/functions/_shared/i18n`.
- `translate()` ima fallback: `CATALOGS[lang][key] ?? CATALOGS.hr[key] ?? key` — **ako ključ ne postoji, vraća sam ključ**, tiho, bez logiranja.

Serverski katalog (`_shared/i18n/hr.ts`, 111 ključeva) sadrži samo dio krug ključeva:

| ključ | u serverskom katalogu |
| --- | --- |
| `notifications.krug.member_added.*` | da |
| `notifications.krug.expense_proposed/confirmed/rejected.*` | da |
| `notifications.krug.deletion_requested.*` | da |
| `notifications.krug.deleted.*` | da |
| `notifications.krug.invited.*` | **ne** |
| `notifications.krug.invitation_accepted.*` | **ne** |
| `notifications.krug.invitation_declined.*` | **ne** |
| `notifications.krug.member_left.*` | **ne** |

Uzrok je time potvrđen bez hipoteze: ključevi uvedeni s pozivnicama (jučer) i samoizlaskom (danas) dodani su u `src/i18n/locales/*.json`, ali **ne** i u serverski katalog.

Popravak od 22.7. pokrivao je isključivo in-app/browser render (`resolveNotificationText`); serverski push put je odvojen i ne dijeli te prijevode.

**Zašto čuvar nije uhvatio:** `src/i18n/__tests__/serverCatalogSync.test.ts` provjerava samo smjer *server ⊆ master* (svaki serverski ključ mora postojati u lokaleima). Ključ koji postoji u masteru a fali na serveru — nikad ne pada.

## 3. Jezik primatelja

Postoji i koristi se: `profiles.preferred_language`, popunjen za **13/13** profila. `send-push` ga čita i normalizira (`resolveLang`, fallback `hr`). Ova komponenta radi ispravno.

## 4. Opcije popravka (ne izvodim)

**Opcija A — dopuniti serverski katalog + dvosmjerni čuvar (preporuka)**
- Dodati 8 nedostajućih krug ključeva u hr/en/de serverskog kataloga (kopija iz mastera).
- Novi test: za **svaki** `i18n_*_key` literal koji se pojavljuje u `supabase/functions/**` (uklj. dinamički sastavljene `notifications.krug.<shortKey>.*` iz mape tipova) mora postojati ključ u sva tri serverska kataloga. Time popravak vrijedi za sve tipove, ne po tipu.
- Dodati `console.warn` u `translate()` kad ključ nedostaje, da se sljedeći put vidi u logu umjesto tihog prolaza.
- Opseg: 3 kataloga + 1 test + 1 warn. Rizik: nizak, nema promjene puta ni sheme.

**Opcija B — prijevod u service workeru iz key+vars**
- Payload nosi ključ, SW prevodi.
- Ne rješava Android nativni Capacitor push (FCM notification payload prikazuje OS, SW nije u lancu), traži učitavanje kataloga u SW-u dok je app ugašen. Ne pokriva današnji dokazani put. **Ne preporučam.**

**Opcija C — prevoditi u pozivatelju (`notify-krug-event`) umjesto u `send-push`**
- Duplicira logiku koju `send-push` već ima i razbija jedinstveno mjesto rezolucije. Ne preporučam.

## 5. Utjecaj na retroaktivnu obavijest

Opcija A pokriva i budući tip `krug_membership_notice` **pod uvjetom** da se njegovi ključevi dodaju u serverski katalog — što novi dvosmjerni čuvar iz A onda i prisiljava (test pada ako ključ postoji samo u masteru). Preporuka: retroaktivnu obavijest slati tek nakon što A prođe i nakon jednog živog push testa s prevedenim tekstom.

## Verifikacija nakon popravka

1. Novi krug event (npr. pozivnica) → `push_delivery_logs` redak `lifecycle_stage=fcm` mora imati **prevedeni** `title`, ne ključ.
2. `notifications` redak i dalje sadrži ključ (in-app render se ne mijenja).
3. Test pada na namjerno uklonjenom ključu iz serverskog kataloga.
