
# Mišljenje o dvije javne edge funkcije

Samo analiza i preporuke — bez koda dok ne odlučiš smjer.

---

## 1. `notify-crash` — dodatne rupe koje niste naveli

Potvrđeno čitanjem `supabase/functions/notify-crash/index.ts`:

**Kritično (spam/impersonation):**
- **Dedup ne štiti od varijacija.** Napadač generira random string u `message` (`crash #837423`) → svaki poziv je novi signature → email po pozivu. Dedup je optimizacija za honest klijente, ne obrana.
- **`userId` bez ikakve provjere.** Redak 87–94: `admin.auth.admin.getUserById(body.userId)` vraća pravi email tuđeg korisnika i lijepi ga u admin alert. Zapravo je to **user enumeration primitive** (možeš od bilo kojeg UUID-a saznati postoji li i koji mu je email — razlika između "email prisutan" i "ignore" u odgovoru je opservabilna kroz kasniji admin email, ali ne kroz HTTP response — pa je nisko-rizično eksterno, ali ostavlja PII u admin inboxu na napadačev zahtjev).
- **Payload injection u email.** `body.stack` (500 znakova) i `message` (200) idu u HTML email preko `sendCrashAlert`. Trebalo bi provjeriti radi li se HTML-escaping tamo — ako ne, napadač šalje `<img src=x onerror=...>` u admin inbox (u praksi većina email klijenata blokira, ali svejedno).

**Srednje:**
- **Nema payload size limita** na razini funkcije. Deno.serve prima cijeli JSON prije nego `req.json()` završi. Trebao bi `Content-Length` gate ili `req.body` streaming s cap-om (npr. 32 KB).
- **`route` bez validacije.** Ide u email (`sample_route`), pa napadač može ubaciti fake URL koji admin klikne.
- **Nema `source` whitelist provjere** — tip veli `'error_boundary' | ...`, ali runtime prihvaća bilo što.

**Nisko:**
- **CORS `*`** je namjeran (client-side crash iz bilo kojeg buildaja) — OK, ali pojačava zloupotrebu.
- **`monitor_alerts_log` insert bez rate gate-a** može pojesti disk/rows brže od cron cleanupa.

**Ono što jest OK:**
- Dedup po signature (60 min) za honest klijente.
- Idempotency key na email queue → čak i ako iste crash pozove 20 tabova, admin dobije jedan email po satu.
- Service-role klijent samo interno; ne echo-a se kljuc.

---

## 2. `lookup-company` — dodatne rupe

Potvrđeno čitanjem `supabase/functions/lookup-company/index.ts`:

**Kritično:**
- **AI kvota drenaža:** javna funkcija + Gemini call → svaki bot na svijetu može trošiti tvoj €100/mj cap. `checkAiCostCap` samo blokira **nakon** dostizanja capa — ne štiti od jednog napadača koji potroši mjesečni budžet za 4 minute.
- **`LOVABLE_API_KEY` throw na startu** (redak 200) — identičan bug kao u `financial-assistant`. Runtime error umjesto graceful degradacije. Trebao bi biti `503 { error: 'ai_unavailable' }` ne throw.

**Srednje:**
- **Nema cachea** — potvrđujem. `Konzum` 500 puta = 500 poziva Gemini + trošak. Kritično jer je query prostor mali (nekoliko tisuća poznatih tvrtki pokriva 95% prometa).
- **Query bez sanitizacije ide u AI prompt** kao user content. Prompt injection nije katastrofalan (funkcija vraća samo strukturirani tool call), ali napadač može manipulirati modelom da vrati garbage — trošak isti.
- **CORS `*`** znači da bilo koji site može pozvati funkciju iz browsera i tebe zaduži.

**Nisko:**
- Numerički (OIB/MBS) put je hardcode isključen (redak 207) — dead code za sada, ali čim se uključi, otvorit će se dodatna površina.
- Log linije 32–34 loguju **prefiks tokena** (`token.substring(0, 30)`). To je premalen za rekonstrukciju, ali dobra praksa je 0 znakova.

**OK:**
- `checkAiCostCap` postoji (global brake).
- Structured tool output limitira model, ne "free-form".

---

## 3. Preporuke po pitanju

### Q2 — notify-crash rate limit i userId

**Rate limit:** 5/IP/sat je razumno za honest klijente (isti user u istom satu ne bi trebao imati 5 različitih crashera). Preporučam **par-lock**:
- Ukupno **20 poziva/IP/sat** (svi crash tipovi),
- Kombiniran s postojećim signature dedup (60 min).
- Rate log u novoj `crash_report_rate_limit` tablici, `(ip_hash, window_start)` — bez PII, hashiran IP.

**userId politika (moja preporuka):** **potpuno ignoriraj `userId` iz payloada**. Umjesto toga:
- Ako je Authorization header prisutan i validan JWT → izvuci `sub` iz `getClaims()`.
- Ako nije → alert bez usera. Admin i tako ima route + stack.

Prednost: nema user enumeration primitive-a, nema PII na napadačev zahtjev, jednostavnije. `verify_jwt = false` može ostati, samo se JWT čita ako postoji.

**Ostalo obavezno:**
- Payload cap 32 KB (`Content-Length` check + rez).
- `source` whitelist (3 stringa, sve ostalo → 400).
- HTML-escape `message`/`stack` prije emaila (provjeriti `sendCrashAlert.ts`).
- Truncate `route` na 500 znakova; blokiraj `javascript:` i `data:` sheme.

### Q3 — lookup-company: JWT ili public + rate?

**Preporuka: zahtijevaj JWT.** Razlozi:
- Lookup-company se u appu koristi samo za popunu Business profila i klijent podataka → user MORA biti ulogiran da mu to nešto znači.
- Public + rate ne rješava distribuiran napad (100 IP-eva × 10/h = 1000/h) — AI kvota ide.
- Autentikacija sama daje ti per-user rate limit besplatno (`user_id` kao ključ).

Konkretno:
- `verify_jwt = false` **ostati** (postoji šansa da se poziva iz `businessProfileOnboarding` prije nego `session` stigne), ali funkcija sama zahtijeva Bearer i vraća 401 ako fali.
- Per-user rate: 20 upita/sat, 100/dan (dovoljno za honest korištenje).
- Global brake `checkAiCostCap` ostaje.

**Cache TTL:**
- **Duljina naziva → 7 dana** (naziv tvrtke, OIB, adresa se ne mijenjaju često; sudreg u praksi jednom godišnje).
- Normalizacija ključa: `lower(trim(query))` + collapse whitespace. `Konzum` = `konzum` = `KONZUM  ` = jedan cache hit.
- Cache tablica `company_lookup_cache(query_normalized PK, payload jsonb, hit_count, updated_at)`. Odbaci upite < 3 znaka.

24h što si predložila je predoprezno — očekivano ušteda ~40%. 7 dana → ~85% za popularne queryje.

### Q4 — email/telefon/website u odgovoru?

**Moja preporuka: MAKNI email/telefon/website.**

Razlog nije samo GDPR — nego **činjenična neispravnost**:
- Sudreg **ne daje** telefon ni website; polja `phone` i `website` u kodu su hardcoded `""` iz sudreg-a i pop up-aju jedino kroz AI fallback → to su **halucinacije** (Gemini pogađa telefon iz svog treniranog korpusa). Za obrt "Frizerski salon Ana" AI će vratiti nasumičan telefon → korisnik će zvati nepoznatu osobu. Točno tip greške koji Milan hoće izbjeći ("nikad ne halucinacije, ako ne znaš — 'ne znam'").
- Email iz sudreg-a je legitiman (poslovni email tvrtke) — može ostati; iz AI-a **ne**.

Preporuka: `{ company_name, oib, mbs, address, city, postal_code, country, legal_form, court_registry, activity_code, activity_description, source }`. `email` samo ako `source === 'sudreg'` i polje stvarno postoji. `phone`, `website` — nikad iz AI.

---

## 4. Rupe koje NISTE spomenuli, po važnosti

1. **User enumeration + PII eksfiltracija** kroz `notify-crash` `userId` → admin email s tuđim mailom (najkritičnija; napadač ne vidi email, ali dovodi PII u admin inbox na svoj zahtjev — GDPR nezgodno).
2. **`lookup-company` halucinacije phone/website** — direktan business-impact bug, ne "sigurnost", ali gadan.
3. **HTML injection u crash email** (ako `sendCrashAlert.ts` ne escape-a — treba provjeriti).
4. **Nema payload size limita** na obje funkcije (memory pressure napad).
5. **Log tokena prefiksa** u `lookup-company:33`.
6. **Numeric lookup dead code** — kad se uključi, otvara drugu površinu; već sad ga je bolje maknuti dok se ne definira reset (i pripadajući rate).

---

## Otvorena pitanja prije nego išta gradim

1. **notify-crash userId:** slažeš li se s "potpuno ignoriraj payload userId, čitaj samo iz JWT ako postoji"? Ako da, `PII u alert email` nestaje kao klasa problema.
2. **lookup-company auth:** JWT-required (moja preporuka) ili public + agresivan IP rate? Prva opcija je jednostavnija i sigurnija; druga zahtijeva IP-hash tablicu i dodatnu logiku.
3. **Cache TTL:** 7 dana OK, ili držiš na 24h?
4. **Halucinirana polja:** brišemo `phone`/`website` iz AI odgovora (moja preporuka), ili ih ostavljamo s eksplicitnim `unverified: true` flagom u UI?
5. **Rate limit primitiva:** `no-backend-rate-limiting` knowledge kaže da nemamo standard primitive. Za obje funkcije bih dodao **ad-hoc tablicu** (`edge_fn_rate_limit(key text, window_start timestamptz)`) uz eksplicitni "tradeoff" pristanak — je li OK?
6. **HTML-escape provjera:** smijem li otvoriti `_shared/sendCrashAlert.ts` da vidim escape-a li on `stack`/`message`, ili ćeš ti provjeriti?

Kad odgovoriš na tih 6, spreman sam napraviti plan za gradnju.
