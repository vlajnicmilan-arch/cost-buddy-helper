
# Plan: throttle za ručni bank-sync (Faza 1)

Cilj: spriječiti da ručni "Osvježi" udara u ASPSP 429. Bez dirananja auth modela, multi-tenanta, balance engine-a ili crona.

## 1. Gdje throttle živi — **oboje**

- **Backend (`bank-sync-transactions/index.ts`) = prava zaštita.** Odmah nakon učitavanja `bank_accounts` reda, prije prvog `ebFetch` poziva, provjeri:
  - `last_synced_at` — ako je unutar cooldown prozora, vrati `429` (ili `409`) s JSON-om `{ error: "throttled", retry_after_seconds: N, last_synced_at }`. **Ne troši EB poziv.**
  - `last_sync_error` — ako je zadnji sync završio s `fetch_failed_429` (ili novom oznakom `aspsp_rate_limited`) unutar cooldowna nakon 429, vrati `{ error: "aspsp_cooldown", retry_after_seconds: N }`.
- **Frontend (`OpenBankingPanel.tsx`) = UX sloj.** Iz već poznatog `acc.last_synced_at` izračuna preostalo vrijeme, disable-a "Osvježi" gumb i prikazuje odbrojavanje ("Sljedeće osvježavanje moguće za 42 min"). Ako korisnik svejedno klikne (npr. drugi tab), backend ga vrati s prijaznom porukom umjesto EB pozivom.

Frontend sam nije dovoljan (može se zaobići reloadom, drugom sesijom, curl-om). Backend sam radi ali je UX loš (klik → čekanje → greška). Oboje = robust + čist UX.

## 2. Prag (cooldown)

- **Normalni cooldown: 30 minuta po računu.** PSD2 dozvoljava 4/dan/račun (unattended); kad je korisnik prisutan (SCA ≤ 90 dana) nema strogog limita, ali Erste ipak vraća 429 na burst. 30 min ostavlja Milanu ~48 slotova dnevno kad zbilja treba svjež podatak, dok sprječava rapid-fire.
- **Post-429 cooldown: 60 minuta po računu.** Ako je EB/ASPSP već vratio 429, čekamo dulje.
- Vrijednosti izložene kao **konstante na vrhu edge funkcije** (`SYNC_COOLDOWN_MINUTES = 30`, `RATE_LIMIT_COOLDOWN_MINUTES = 60`), lako kasnije podesiti bez migracije.

Ne predlažem dnevni brojač (4/dan) u fazi 1 — dodaje state i tablicu; 30-min cooldown pokriva 90%+ slučajeva jednostavnije.

## 3. Kako izmjeriti "koliko je prošlo"

**`bank_accounts.last_synced_at` je dovoljan** i već postoji (potvrđeno u schemi: `timestamp with time zone`). Funkcija ga trenutno ažurira na kraju uspješnog sync-a (`.update({ last_synced_at: new Date().toISOString(), last_sync_error: null })`).

Za post-429 cooldown iskoristit ćemo postojeći `last_sync_error` (tekstualno polje). Kod već upisuje `fetch_failed_429` kad EB vrati 429. Trebat će samo dodati timestamp — najjednostavnije **iskoristi `updated_at`** (auto-touched preko update triggera) uz `last_sync_error LIKE '%429%'`. Ako se pokaže da `updated_at` "drifta" iz drugih razloga, u fazi 1.5 dodamo `last_sync_error_at` kolonu (jedna migracija). **Za fazu 1: bez migracije.**

## 4. Poruka korisniku (i18n hr/en/de)

Backend vraća strukturirani JSON, frontend prevodi. Novi i18n ključevi (u `src/i18n/locales/{hr,en,de}/*`):

- `bank.throttle.recent` → "Osvježeno prije {{ago}}. Sljedeće osvježavanje moguće za {{remaining}}."
- `bank.throttle.rateLimited` → "Banka je privremeno ograničila pristup. Pokušajte ponovno za {{remaining}}."
- `bank.throttle.buttonCountdown` → "Osvježi (za {{remaining}})"

Bez toast tehničkih grešaka. `StatusFeedback` (postojeći sustav, 1200ms) za "Osvježeno" success; inline hint ispod gumba za throttle stanje.

## 5. Cooldown nakon 429

Već pokriveno u točki 2: `RATE_LIMIT_COOLDOWN_MINUTES = 60`. Trigger:
- Ako `ebFetch` vrati 429 → backend upiše `last_sync_error = 'aspsp_rate_limited_429'` (mala promjena postojeće poruke `fetch_failed_429` radi jasnoće) i vrati HTTP 429 s `retry_after_seconds`.
- Sljedeći poziv u prozoru: backend vidi flag, vraća `{ error: "aspsp_cooldown" }` **bez EB poziva**.
- Nakon isteka: normalno stanje.

## 6. Opseg i rizik

**Ne dira:**
- ❌ auth model (funkcija i dalje traži user JWT, isti flow)
- ❌ multi-tenant (throttle je per-account, per-user već preko postojećih RLS-a)
- ❌ balance/settlement/engine (ne dira `expenses`, ne dira sidra, ne dira `custom_payment_sources`)
- ❌ cron (nema novog rasporeda)
- ❌ baza (nema migracije u fazi 1)
- ❌ `_shared/enableBankingJwt.ts` (throttle je iznad EB poziva)

**Dira samo:**

| Datoteka | Promjena |
|---|---|
| `supabase/functions/bank-sync-transactions/index.ts` | ~40 linija: konstante, pre-flight provjera `last_synced_at` + `last_sync_error`, strukturirani 429 odgovori, precizniji `last_sync_error` string |
| `src/components/OpenBankingPanel.tsx` | Odbrojavanje preostalog vremena iz `acc.last_synced_at`, disable gumba, čitanje strukturiranog error responsea, prikaz i18n poruke |
| `src/i18n/locales/hr/*.json` (+ en, de) | 3 nova ključa iz t. 4 |

Rizik: nizak. Ne mijenja tijek podataka; samo dodaje pre-flight guard i UX oko postojećeg gumba.

## Otvoreno pitanje za Milana prije build-a

Potvrdi vrijednosti:
- **Normal cooldown: 30 min** — OK, ili radije 60 min (konzervativnije, veći headroom za budući cron)?
- **Post-429 cooldown: 60 min** — OK, ili 120 min?
- Koristiti postojeći `updated_at` kao proxy za "kad je bio zadnji error" (**bez migracije**) ili radije dodati `last_sync_error_at` kolonu odmah (**jedna mini-migracija**)?

Čekam potvrdu prije bilo kakve gradnje.
