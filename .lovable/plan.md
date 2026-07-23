
## Analiza cron gapa — zaključak

Od četiri funkcije samo **jedna** je stvarno propust; ostale su namjerno on-demand.

### 1. `auto-reject-pending` — PROPUST, treba cron

Nema `Authorization` provjere, ne prima nikakav payload — samo skenira `expenses` gdje je `status='pending'` i `created_at < now()-24h`, briše ih i šalje notifikacije. Nema tko ovo pozvati iz frontenda (bio bi to skeniranje po tuđim redovima). Ako cron ne radi, pending transakcije nikada ne isteknu.

**Preporučeni schedule:** `0 * * * *` (svaki puni sat).
Razlog: politika je "24h", pa je satna granularnost dovoljno precizna (najgore odbijanje ide 24h 0–59min nakon unosa). Dnevni cron bi bio prekasan, minutni bi bio bespotrebno bučan.

### 2. `check-budget-alerts` — namjerno app-triggered

Traži `Authorization: Bearer`, validira JWT preko `getClaims`, i iz bodyja čita `{category, amount, expense_date}`. Ovo je hook koji frontend zove **odmah nakon što korisnik ubaci trošak** kako bi provjerio prelazi li novi trošak prag budžeta i poslao push. Cron ne bi imao smisla — bez konteksta konkretne transakcije alert bi bio ili duplikat ili šum.

### 3. `exchange-rates` — namjerno app-triggered

Public GET s in-memory cacheom 1h (`cachedRates` + `cacheTimestamp`). Prvi klijent u satu zagrijava cache, ostali dobiju kešano. Cron nije potreban; mogao bi se dodati samo kao pre-warm optimizacija (npr. `0 6 * * *` prije poslovnog dana), ali korist je marginalna jer prvi korisnik ionako aktivira fetch (~200ms).

### 4. `match-recurring` — namjerno app-triggered

Traži JWT (`requireAuth`), prima `{transactions, recurringTransactions}` u bodyju i troši AI kvotu (`checkAiQuota` + `checkAiCostCap`). Ovo je AI alat koji korisnik svjesno pokreće (npr. u "Sparivanje ponavljajućih"). Cron bi trošio Gemini kredite bez potvrde korisnika — protivno pravilu iz memorije (AI write akcije = dvofazna potvrda).

---

## Preporuka za build

**Jedna promjena, jedan deploy:**

Dodati cron zapis za `auto-reject-pending` sa scheduleom `0 * * * *` preko `supabase--insert` u `cron.job` (koristi `net.http_post` s anon keyom, po istom obrascu kao ostali aktivni jobovi — `activation-nudge`, `auto-invoice-reminders`).

Ostale tri funkcije **ne dirati** — trenutno ponašanje je ispravno po dizajnu.

### Otvoreno pitanje prije builda

Cron `auto-reject-pending` je u naravi **destruktivan** (`DELETE FROM expenses`). Prije nego uključim satni schedule, treba potvrditi:
- Je li 24h politika još važeća? (Postoji li scenarij gdje odobravatelj namjerno drži `pending` duže?)
- Želiš li dry-run varijantu (samo notifikacija, bez brisanja) jedan tjedan da vidimo volumen prije nego uključimo brisanje?

Ako je odgovor "politika stoji, uključi ga odmah" — plan je jedan `supabase--insert` cron poziv.
