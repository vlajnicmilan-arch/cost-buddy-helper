# Nalaz: pozivnica u Krug „Test 2" pada — istekla/nevažeća sesija (401), ne baza

## Što dokazi pokazuju

**1. Runtime log `krug-add-member` (17:55–18:05 UTC): NEMA nijedne `[KRUG-ADD-MEMBER]` linije.**
Samo boot/shutdown parovi u 17:55:12, 17:57:10, 17:59:44/45. Dakle funkcija je pozvana i podignuta, ali je izašla prije ijednog `console.*` poziva.

**2. To isključuje `insert_failed` i `lookup_failed`.**
Svaka od tih grana u kodu prvo radi `console.error(...)`. Nijedne nema → nije bilo ni pokušaja inserta ni greške u lookupu.

**3. Grane koje ne logiraju:** `unauthorized` (401), `invalid_input`, `not_owner`, `user_not_found`, `cannot_add_self`, `already_member`, `already_invited`.
Sve osim `unauthorized` vraćaju HTTP 200 s poznatim kodom koji `translateAddError` mapira u konkretnu poruku. Korisnik je vidio GENERIČKU poruku → kod je bio `unexpected`, a `unexpected` u hooku nastaje samo kad `supabase.functions.invoke` vrati `error`, tj. kad odgovor NIJE 2xx. Jedini ne-2xx put u funkciji prije logiranja je **401 `unauthorized`**.

**4. Auth logovi istog prozora potvrđuju slomljenu sesiju kod Milana:**
- `/user` 403 `session_not_found` u 17:57:48, 17:59:45, 17:59:50, 18:00:48, 18:01:48
- `check-subscription` → `Authentication error: Auth session missing!` u 17:59:90/18:00:48/18:01:48 prozoru
- `POST /token` 400 `refresh_token_not_found` u 18:02:47
- tek u 18:03:00 novi Google login (Milan) → nakon toga `/user` 200

Vremenski se poklapa 1:1 s pokušajima pozivanja.

**Zaključak:** klijent je slao istekli/nevažeći access token; `userClient.auth.getUser()` u edge funkciji vraća grešku → `401 unauthorized` bez loga → UI prikaže generičku poruku. Baza, trigger, RLS i `find_user_by_email` nisu sudjelovali. Nema kvara u logici pozivnica.

## Odgovori na pitanja

**1. Koji error je vraćen:** `{"error":"unauthorized"}` sa statusom 401 (izvedeno iz odsutnosti logova + generičke UI poruke + auth logova; funkcija tu granu ne logira, pa nema doslovnog teksta u logu).

**2. Postgres error:** nema ga — do inserta nikad nije došlo.

**3. Nedostajući `profiles` redak: NEMA ulogu na ovom putu.**
`find_user_by_email` čita isključivo `auth.users`. Ni `krug-add-member` ni `notify-krug-event` ne čitaju `profiles`. Jedino `send-push` čita `profiles.preferred_language` — i to s fallbackom na `hr`, tako da bi push i dalje radio.

**4. Zašto nema profila — premisa je netočna:** profil NEMA 13 od 14 korisnika, uključujući samog Milana (`d4d31ee6`) i Vinku. To NIJE anomalija specifična za `hr.akrobat`. Trigger `on_auth_user_created` → `handle_new_user()` na `auth.users` postoji i uključen je (`tgenabled = 'O'`), ali očito ne upisuje u `profiles` za većinu računa (ili upisuje u nešto drugo). To je odvojena tema koju vrijedi zasebno provjeriti.

## Prijedlog (odluka je tvoja, ništa nije mijenjano)

**A. Reprodukcija prije bilo kakve izmjene (0 rizika):** Milan je ponovno prijavljen od 18:03. Neka ponovi poziv `hr.akrobat@gmail.com` u Krug „Test 2". Očekivanje: prolazi. Ako prođe — dijagnoza potvrđena, dalje idu samo čuvari niže.

**B. Vidljivost (mali zahvat):**
1. `console.warn` u 401 grani `krug-add-member` (bez ispisa tokena), da ova klasa više nikad ne bude nevidljiva u logu.
2. Hook `useKrugAddMember`: kad `functions.invoke` vrati `FunctionsHttpError` sa statusom 401, mapirati u `'unauthorized'` umjesto `'unexpected'`, i dodati i18n poruku tipa „Sesija je istekla — prijavi se ponovno." (hr/en/de).

**C. Odvojena istraga (ne dira ovaj put):** zašto `handle_new_user()` ne stvara `profiles` retke. Prije bilo kakvog backfilla treba pročitati živu definiciju funkcije i utvrditi radi li išta drugo (npr. drugu tablicu) — inače riskiramo popravak simptoma.

## Tehnički detalji

- Krug „Test 2" `749e4754…`: `krug_ownership` = Milan, 1 članstvo (Milan, `punopravni`) — uredan.
- `krug_invitations`: nijedan redak za `749e4754…`; postojeći redovi su samo iz kruga „Test" (Petar: revoked + 2× accepted).
- `hr.akrobat@gmail.com` = `502cff5f…`, potvrđen, nije banned — `find_user_by_email` bi ga našao.
