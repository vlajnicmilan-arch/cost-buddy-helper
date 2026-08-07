# Krug — ulazak u krug bez pristanka

## Nalaz (provjereno u kodu i bazi)

### 1. Gdje se dodavanje događa

- UI: `src/components/krug/AddKrugMemberDialog.tsx` → hook `useKrugAddMember` (`src/hooks/useKrugMemberMutations.ts`).
- Server: edge funkcija `supabase/functions/krug-add-member/index.ts`. Provjeri da je pozivatelj vlasnik (`krug_ownership`), nađe korisnika preko `find_user_by_email` (service role), i **odmah ubaci redak u `krug_membership`** sa `role` koju je vlasnik odabrao i `added_by = vlasnik`. Nema nikakvog međukoraka.
- RLS (žive politike):
  - `krug_membership_insert_owner` — INSERT dopušten kad `krug_is_owner(krug_id, auth.uid())`, tj. **i direktan insert iz klijenta prolazi**, edge funkcija nije jedini put.
  - `krug_membership_select_member` — SELECT za članove kruga.
  - `krug_membership_update_owner` / `krug_membership_delete_owner_not_self` — vlasnik mijenja ulogu i uklanja druge.
- Zaključak: potvrđeno — nema tablice pozivnica za Krug; `budget_invitations`, `income_source_invitations`, `payment_source_invitations`, `project_invitations` postoje, Krug ih nema.

### 2. Što se okine u trenutku upisa

- **Podjele:** DB funkcija koja gradi sudionike podjele bira `krug_membership WHERE role = 'punopravni'`. Novi punopravni član **odmah ulazi u prijedloge podjela i u salda „tko kome duguje"**, bez ijedne radnje s njegove strane.
- **Vidljivost:** `krug_is_member` / `krug_is_full_member` su temelj RLS-a za krug, članstva, dijeljene izvore i krug-troškove — od sekunde upisa novi član vidi krug, popis članova, dijeljene izvore i tijek troškova; krug njega vidi u svakom izračunu.
- **Uloga:** bira je vlasnik pri dodavanju (`punopravni` = pun glas i ulazak u podjele, `obicni` = ograničeno). Pozvani nema utjecaja.
- **Obavijest:** kod postoji (`notify-krug-event`, tip `krug_member_added`), ali je fire-and-forget. U bazi ukupno **2 retka tipa `krug_member_added`**, i **nijedan za dodavanja od 7.8.** (Petar, `krug_membership` upisan 18:37:41, 28 s nakon kruga) — dakle u praksi ni obavijest nije stigla. Obavijest ionako nije pristanak.

### 3. Prijedlog opsega: `krug_invitations`

Uzor: **`payment_source_invitations`** — najbliži je jer dijeli isti oblik (pozivnica na dijeljeni financijski entitet, uloga se bira pri pozivu, `invited_user_id` za postojeće korisnike, token za one bez računa) i već ima zajedničku RPC `consume_invitation_token`.

Predložena tablica (zrcalo postojeće sheme):

| stupac | uloga |
|---|---|
| `krug_id` | krug |
| `email` | adresa poziva |
| `invited_user_id` | popunjen kad korisnik postoji |
| `invited_by` | pozivatelj (vlasnik) |
| `role` | `punopravni` / `obicni`, bira vlasnik |
| `status` | `pending` / `accepted` / `declined` / `expired` / `revoked` |
| `token`, `expires_at` (7 dana), `used_at`, `created_at` | isto kao kod izvora plaćanja |

Tijek:

```text
vlasnik -> krug_invitations (pending)  --prihvat-->  krug_membership (role iz pozivnice)
                     |                --odbij--->   declined  (ostaje trag, bez članstva)
                     |                --istek--->   expired
                     +--povuci------->  revoked
```

- `krug-add-member` prestaje pisati u `krug_membership` i piše pozivnicu.
- Prihvat/odbijanje ide kroz `SECURITY DEFINER` RPC koji smije zvati **samo pozvani** (`auth.uid() = invited_user_id` ili token), s provjerom isteka i preset-capa (`krug_enforce_punopravni_cap`) u trenutku prihvata, ne poziva.
- Obavijest: novi tip `krug_invited` kroz postojeći `notify-krug-event` + `notifications` (kategorija `krug`), i obavijest vlasniku na prihvat/odbijanje. Ista dedup logika.
- Do prihvata pozvani **nije član**: `krug_is_member` ga ne vidi, ne ulazi u podjele, salda ni vidljivost. Jedino što vidi je sama pozivnica.
- RLS: pozivnicu vidi vlasnik kruga i pozvani; briše/povlači samo vlasnik.
- **Nužno uz to:** `krug_membership_insert_owner` mora se suziti (samo RPC prihvata smije stvoriti članstvo), inače pozivnica ostaje kozmetika jer klijent može direktno insertati.

### 4. Rubni slučajevi

- **Nema račun:** pozivnica po e-mailu s tokenom, kao kod izvora plaćanja; prihvat nakon registracije preko `consume_invitation_token`. Ako je e-mail slanje izvan opsega, poziv se ograniči na postojeće korisnike (današnji `user_not_found`) — treba odluka.
- **Odbijena:** `declined`, bez članstva; ponovni poziv dopušten (nova pozivnica), uz zaštitu od spama (npr. jedna aktivna `pending` po paru krug+e-mail).
- **Istekla:** `expired` nakon 7 dana; prihvat nakon isteka odbijen.
- **Povlačenje:** vlasnik može `revoked` dok je `pending`.
- **Uloga:** bira se pri pozivu i zapisuje u pozivnicu; kod prihvata se preslikava u članstvo. Cap se provjerava pri prihvatu (dvije pozivnice mogu premašiti cap ako se obje prihvate).
- **Već član / poziv sebi:** postojeće provjere ostaju, samo se pomiču na pozivnicu.

### 5. Postojeća članstva bez pristanka (bez odluke)

**A. Ostaviti kako jest + retroaktivna obavijest „u ovom krugu si od …, možeš izaći".**
Za: nula rizika za podatke, nijedan izračun se ne mijenja, najmanje posla.
Protiv: pristanak nikad nije dan; za plaćeni modul ostaje pravna/etička rupa.

**B. Pretvoriti u pozivnice na čekanju** (članstvo se makne, pozivnica `pending`).
Za: čisto stanje, svi članovi su pristali.
Protiv: postojeći krugovi se raspadaju do prihvata — podjele, salda i povijest troškova pozvanih ostaju bez sudionika; potreban je odgovor što s već zabilježenim podjelama na koje je osoba upisana.

**C. Međukorak:** članstvo ostaje, ali dobiva `consent_state = grandfathered` i traži se potvrda pri prvom otvaranju Kruga; do potvrde nema pisanja u njegovo ime.
Za: bez razaranja podataka, pristanak se ipak prikuplja.
Protiv: dodatno stanje u modelu i UI-u.

### 6. Procjena za 28.8.

- **Puna verzija** (tablica, RPC-i, sužena RLS, UI za pozivnicu i inbox, obavijesti, token za neregistrirane, istek, povlačenje, i18n hr/en/de, testovi + SQL suite): realno **4–6 radnih dana**.
- **Sužena, sigurna verzija za launch** (dovoljna da kvar ne postoji): tablica + `pending/accepted/declined/revoked`, poziv samo postojećim korisnicima, prihvat/odbijanje RPC, **suženi RLS insert**, obavijest kroz postojeći sustav, mali UI (dijalog vlasnika + kartica „Pozvan si u krug" na `/krug`). Bez istekâ, bez tokena za neregistrirane, bez e-maila: **1,5–2,5 dana**. Istek i e-mail se dodaju kasnije bez migracije podataka ako se stupci `token`/`expires_at` odmah stave u shemu.

## Tehnički dodatak

Datoteke koje bi zahvat dirao: `supabase/functions/krug-add-member/index.ts`, nova migracija (`krug_invitations`, RPC-i, sužen `krug_membership_insert_owner`), `src/hooks/useKrugMemberMutations.ts`, `src/components/krug/AddKrugMemberDialog.tsx`, nova komponenta inboxa u `src/components/krug/`, `notify-krug-event` (novi tipovi), i18n hr/en/de, `supabase/tests/krug/*` (test da insert u `krug_membership` bez prihvaćene pozivnice padne).

Ne dira: motor salda, podjele, dijeljene izvore, brisanje kruga.
