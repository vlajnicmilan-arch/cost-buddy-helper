## Cilj
Dobiti sirovi Enable Banking payload za Revolut sesiju `276ab9c0-3157-4f68-9f5b-0b29dbe1fe88` da razriješimo:
- **(a)** EB stvarno vraća prazno (Revolut PSD2 / EB strana ne izlaže račun), ili
- **(b)** EB vraća račune u ključu koji naš parser (`session.accounts ?? []`) ne čita.

## 1. Koji EB endpoint pokazuje istinu

Naš `bank-connect-complete` radi jedan poziv:
- `POST /sessions` (razmjena `code` → session objekt). Iz tog odgovora čita `session.accounts` (fallback `[]`) i `session.session_id`.

Za dijagnozu su tri EB endpointa relevantna, svi read-only (GET), autorizirani istim RS256 JWT-om (App ID + private key) preko postojećeg `ebFetch()` helpera:

1. **`GET /sessions/{session_id}`** — vraća cijeli session objekt kakav postoji sada na EB strani. Očekivani oblik (prema EB dokumentaciji):
   ```json
   {
     "status": "AUTHORIZED",
     "accounts": [ { "uid": "...", "account_id": {"iban": "..."}, "name": "...", "currency": "EUR", ... } ],
     "access": { "accounts": [...], "valid_until": "..." },
     "aspsp": { "name": "Revolut", "country": "LT" },
     "psu_type": "personal"
   }
   ```
   Ako je `accounts: []` ovdje, EB stvarno nema računa za taj consent → **(a)**.
   Ako `accounts` sadrži elemente, ili se pojavljuje pod drugim ključem (`accounts_data`, `access.accounts`, itd.) → **(b)**.

2. **`GET /accounts`** (s `Session-Id` header / query param — točan mehanizam ovisi o EB implementaciji; treba provjeriti u dokumentaciji prije poziva). Alternativni pogled istog resursa; korisno ako `/sessions/{id}` iz nekog razloga ne vraća `accounts` array uopće.

3. **`GET /sessions/{session_id}/accounts`** (ako postoji kao poseban resurse) — neki PSD2 agregatori razdvajaju session metadata od accounts liste.

**Prijedlog:** krenuti s (1). Ako je jasan odgovor, ne trebaju (2)/(3). Ako je payload dvosmislen, dodati (2) u istoj dijagnostici.

## 2. Opcije izvršenja (za Milanovu odluku)

### Opcija A — privremeni `console.log` u `bank-connect-complete`
- **Što se mijenja:** jedan redak `console.log("[diag] EB session payload:", sessText)` odmah nakon `sessRes.text()`.
- **Postupak:** deploy → Milan ponovno pokreće Revolut spajanje → payload završi u edge logu → log se čita → redak se briše u istom radu (isti commit dodaje i vadi).
- **Prednosti:** hvata točno onaj payload koji dolazi u realnom OAuth flowu.
- **Mane:** traži da Milan **prekine trenutnu konekciju** (`d6176227…`) i napravi novu (jer se `code→/sessions` razmjena dešava samo jednom po authorization codeu). Trenutni session_id nam ne pomaže jer taj put ne prolazi kroz callback ponovno.
- **Trajnost:** privremeno; nakon vađenja log-a, kod je vraćen u prethodno stanje.

### Opcija B — jednokratna read-only diag edge funkcija
- **Što se mijenja:** dodaje se privremena edge funkcija (npr. `eb-diag-revolut`) koja radi **samo GET** pozive na EB (`/sessions/{id}`, opcionalno `/accounts`) koristeći postojeći `ebFetch()` iz `_shared/enableBankingJwt.ts`. Vraća raw JSON. **Ne piše u bazu.** Session ID je hardkodiran ili prosljeđen kao query param, restriktiran na Milanovu rolu.
- **Napomena:** iz konteksta prethodnog rada takva funkcija (`supabase/functions/eb-diag-revolut/index.ts`) već postoji od zadnjeg turn-a. Ovaj plan predlaže: **potvrditi da je i dalje read-only**, pozvati je jednom nad **trenutnom** sesijom (`276ab9c0…`), pročitati odgovor, **obrisati funkciju** u istom radu.
- **Prednosti:** ne traži novi consent flow niti prekid trenutne konekcije. Radi nad *točno onom* sesijom koja je vratila 0 računa. Trenutačan odgovor.
- **Mane:** ostavlja edge funkciju u repo-u do brisanja; treba disciplina da se očisti odmah.
- **Trajnost:** privremeno; funkcija se briše (`supabase--delete_edge_functions` + rm izvornog fajla) u istom radu.

### Opcija C — poziv EB API-ja izvana (curl s JWT-om)
- **Što se mijenja:** ništa u repo-u ni u bazi. Lokalno se generira JWT (isti algoritam kao `enableBankingJwt.ts`) pomoću `ENABLE_BANKING_APP_ID` i `ENABLE_BANKING_PRIVATE_KEY`, i pozove `curl https://api.enablebanking.com/sessions/276ab9c0…`.
- **Prednosti:** apsolutno nula promjena u aplikaciji. Najčišći "read-only".
- **Mane:** private key nije dostupan izvan Lovable Cloud secrets-a — Milan bi ga trebao ručno izvući ili se poziv radi iz sandboxa koji ima pristup secretima. Praktično je ekvivalentno Opciji B ali bez edge funkcije, ako ovaj sandbox može pozvati EB direktno s JWT-om napravljenim u Deno/Node skripti koja učita secrete.
- **Trajnost:** ništa se ne dodaje ni ne mijenja.

## 3. Preporuka

**Opcija B** — jer:
- Radi nad **trenutnom** sesijom (`276ab9c0…`) koja je konkretno vratila 0 računa. Opcija A traži novi consent flow i moglo bi se ponoviti isto ponašanje bez uvida u staru sesiju.
- Ne dira produkcijski `bank-connect-complete` path (nema rizika za druge banke / balance / settlement).
- Diagnostička funkcija već postoji iz prethodnog turn-a — treba samo potvrditi opseg (GET only, bez DB writeova), pozvati, pročitati, obrisati.

Ako Opcija B ne razriješi (npr. EB vrati isti prazan payload i za `/sessions/{id}` i za `/accounts`), tada Opcija A kao drugi korak: dodati diag log i tražiti Milana da ponovi consent flow, jer tada trebamo vidjeti **inicijalnu** `POST /sessions` razmjenu, ne samo current state.

## 4. Ograničenja (potvrđeno)

- **Baza:** nula pisanja. `bank_connections`, `bank_accounts`, `expenses`, sve netaknuto.
- **Trajni kod:** nula izmjena. `bank-connect-complete`, `bank-connect-start`, `_shared/enableBankingJwt.ts` netaknuti.
- **EB strana:** samo GET pozivi, nula pisanja.
- **Druge banke / balance / settlement / recurring / sync:** netaknuto.
- Diagnostika (Opcija A log ili Opcija B funkcija) briše se **u istom radu** čim se odgovor pročita.

## Čeka Milanovu odluku
- Opcija A, B ili C?
- Ako B: potvrda da smijem re-verificirati opseg postojeće `eb-diag-revolut` funkcije (samo `code--view`, bez izmjena) prije poziva.
