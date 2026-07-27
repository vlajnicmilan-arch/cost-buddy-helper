## Nalaz (read-only, ništa nije mijenjano)

### 1. Stanje u bazi
`bank_connections` red `d6176227-…ebbe`:
- provider: `enable_banking`
- aspsp_name: **Revolut**, aspsp_country: **LT** (dakle NIJE krivi ASPSP — Milan je spojio Revolut pod LT, što je ispravno)
- status: `active`
- session_id: `276ab9c0-3157-4f68-9f5b-0b29dbe1fe88` (postoji → EB `/sessions` razmjena je uspjela s 200 OK)
- valid_until: `2027-01-23` (~180 dana, uredno)
- last_error: `NULL`

`bank_accounts` za tu konekciju: **0 redova**.

### 2. Što kaže kod (`supabase/functions/bank-connect-complete/index.ts`)
Redoslijed nakon uspješne razmjene:
```ts
const session = JSON.parse(sessText);
const accounts: any[] = session.accounts ?? [];   // <-- kritična točka
...
if (accounts.length > 0) { upsert + balance fetch }
```
Loga se **samo greška** (session exchange fail, accounts upsert error, balance fetch warn). **Success path ne loga ništa.**

### 3. Što kažu edge logovi
Za funkciju `bank-connect-complete` u zadnjem prozoru **nema nijednog log retka koji spominje** `Revolut`, `d6176227`, `276ab9c0`, `accounts`, `session`, `balance` — samo Boot/Shutdown zapisi. To znači:
- `sessRes.ok === true` (inače bi bio error log + status='failed')
- `accounts.length === 0` (inače bi barem balance-fetch warn ili accounts upsert error postojao) — a i status je postavljen na `active` što se događa **bez obzira** na accounts.length

Dakle grana `if (accounts.length > 0)` **nije se izvršila** za Revolut, dok je za Erste jest.

### 4. Gdje se točno "gube" računi
Ne mogu razlikovati bez uhvaćenog EB response payloada (kod ne loga session body):
- **(a) EB je vratio prazan `session.accounts: []`** za Revolut consent — problem na Revolut/EB strani (consent bez računa, ili LT Revolut sandbox/live specifika).
- **(b) EB je vratio ne-prazan payload pod drugim ključem** (npr. `session.account_list`, `session.access.accounts`) pa `session.accounts ?? []` završi kao prazan → problem u našem parseru.

Grešku (c — 401/403/422) mogu isključiti: status bi bio `failed` i `last_error` popunjen.

### 5. Hipoteza (najvjerojatnije)
Prislanjajući na to da:
- Erste (kroz isti kod, isto polje `session.accounts`) je vratio 5 računa uredno,
- Enable Banking dokumentacija koristi `session.accounts` konzistentno preko ASPSP-ova,
- Revolut LT pod EB je poznat po tome da user tijekom Revolut consent flowa **bira koje račune dijeli**, i default može biti "nijedan" ili samo neki produkti (npr. samo Vaults/Pockets bez glavnog EUR računa),

**vjerojatnije (a): EB je vratio prazan accounts array** jer Revolut consent nije obuhvatio nijedan account resource, iako je Milan "sve odobrio" u našoj percepciji. Revolut PSD2 UI zna imati zaseban korak "select accounts to share" koji se lako preskoči.

Sekundarna mogućnost (b) postoji ali je manje vjerojatna jer bi ista shema pukla i za druge banke.

### 6. Što bi jednoznačno potvrdilo uzrok (NE izvršavam)
Jedan direktan read-only GET na EB `/sessions/276ab9c0-3157-4f68-9f5b-0b29dbe1fe88` (ili `/sessions/{id}` + `/accounts` s tim session bearerom) vratio bi točan payload i završio dilemu (a) vs (b). To zahtijeva dispatch edge funkcije ili dodavanje diag logiranja — čekam Milanovu odluku prije bilo kakve akcije.

### Preporuka za odluku (samo opis, ne izvršavam)
- **Ako Milan potvrdi (a):** ponovno spojiti Revolut i pažljivo proći sve korake u Revolut consent flowu (posebno "select accounts" ekran).
- **Ako želi hard proof prije:** odobriti jednokratni read-only diag poziv na EB `/sessions/{session_id}` (dodati privremeni log ili pozvati kroz jednokratni helper) — da vidimo točan payload prije bilo kakve akcije.

**Ništa nije mijenjano. Čekam Milanovu odluku.**