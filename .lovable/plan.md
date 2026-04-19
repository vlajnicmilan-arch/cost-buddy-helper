

## Plan: Centralizirani sustav praćenja push obavijesti

### Problem
Kada push obavijest ne stigne na uređaj, trenutno nemamo načina vidjeti ZAŠTO. Moramo ručno preglédati edge function logove, kombinirati ih s in-app notifikacijama i FCM odgovorima — to je sporo i nepouzdano.

### Rješenje: tablica `push_delivery_logs` + admin UI za pregled

#### 1. Nova tablica `push_delivery_logs`
Migracija dodaje tablicu koja bilježi SVAKI pokušaj slanja push obavijesti:

```
- id (uuid)
- created_at (timestamptz)
- user_id (uuid)            -- primatelj
- source_function (text)    -- npr. "notify-project-transaction"
- title (text)
- body (text)
- token_count (int)         -- koliko tokena je pronađeno
- success_count (int)       -- koliko je FCM prihvatio
- failure_count (int)
- fcm_error_codes (jsonb)   -- npr. ["UNREGISTERED"] ili null
- request_payload (jsonb)   -- title/body/data za debug
- response_summary (jsonb)  -- sažetak FCM odgovora
- duration_ms (int)
```

RLS: samo admin (`has_role(auth.uid(), 'admin')`) može čitati. Service role piše.

#### 2. Izmjena `send-push` edge funkcije
Na kraju svake invokacije, BEZ obzira na uspjeh ili neuspjeh, upisuje zapis u `push_delivery_logs`. Hvata:
- broj pronađenih tokena
- broj uspješno poslanih
- pojedinačne FCM error kodove (UNREGISTERED, INVALID_ARGUMENT, itd.)
- trajanje
- source_function (iz novog opcijalnog parametra body-ja koji svaki notify-* prosljeđuje)

#### 3. Izmjena `_shared/sendPushNotification.ts`
Dodaje opcijski parametar `source` koji se proslijeđuje u `send-push` body. Tako svaki notify-* zapisuje koja je funkcija pokušala poslati.

#### 4. Novi tab u Admin panelu: "Push Logs"
**Datoteka**: `src/components/admin/PushLogsTab.tsx` + dodati tab u `src/pages/Admin.tsx`

Prikazuje tablicu zadnjih 200 zapisa sa stupcima:
- Vrijeme
- Korisnik (display_name + email)
- Source funkcija
- Naslov / tijelo (skraćeno)
- Status (✓ uspjeh / ✗ greška / ⚠ djelomično)
- Token count → success / fail
- FCM error code (badge)
- Trajanje (ms)

Filteri:
- Po korisniku (search)
- Po source funkciji (dropdown)
- Po statusu (samo greške / sve)
- Po vremenu (zadnjih 24h / 7 dana)

Klik na red → expand s punim payloadom (request + response JSON).

#### 5. Auto-cleanup
Dodati `cleanup_old_push_logs()` funkciju (briše >30 dana) i pozvati je sporadično iz `maybe_cleanup_push_logs` triggera (kao postojeći cleanup_old_chat_messages).

### Što NE diram
- Postojeću push logiku (radi)
- `_shared/sendPushNotification.ts` interface (samo dodajem opcionalni parametar)
- RLS politike na `push_tokens`, `notifications`

### Datoteke
- **Migracija**: nova tablica `push_delivery_logs` + RLS + cleanup funkcija
- **Izmjena**: `supabase/functions/send-push/index.ts` — log na kraju
- **Izmjena**: `supabase/functions/_shared/sendPushNotification.ts` — opcionalni `source` parametar
- **Izmjena (14 funkcija)**: svaka notify-* prosljeđuje `source: 'notify-xxx'`
- **Nova**: `src/components/admin/PushLogsTab.tsx`
- **Izmjena**: `src/pages/Admin.tsx` — novi tab
- **Izmjena**: `src/i18n/locales/{hr,en,de}.json` — admin tab labele

### Test plan
1. Kreiraj testnu transakciju
2. Otvori Admin → Push Logs
3. Vidiš novi zapis: source, broj tokena, status, FCM error (ako ga ima)
4. Ako je `UNREGISTERED` → znamo da je token istekao
5. Ako je `success_count = 0, token_count = 0` → korisnik nema registriran token
6. Ako uopće nema zapisa → `send-push` nije pozvan (problem u notify-* funkciji)

