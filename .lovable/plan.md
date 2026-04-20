
Korisnik želi: app pri pokretanju otvara **osobni mod** (default view), ALI poslovni mod ostaje **uključen u pozadini** — tako da prekidač/switcher u zaglavlju pokazuje da postoji aktivna tvrtka i jedan klik je dovoljan za prebacivanje.

Trenutno stanje (`AppStateContext.tsx` linije 51-59):
- `businessModeEnabled` se nasilno postavlja na `false`
- `active_business_profile_id` se briše iz localStorage

Što treba: razdvojiti dva koncepta:
1. **"Posljednja korištena tvrtka"** (`active_business_profile_id`) — pamti se trajno
2. **"Aktivni view pri startu"** (`businessModeEnabled`) — uvijek `false` na startu (osobni view)

Tako korisnik dobiva:
- Otvori app → vidi osobni mod (sigurnost po defaultu)
- U zaglavlju `BusinessProfileSwitcher` već zna koja je zadnja tvrtka (jer je ID spremljen)
- Jedan klik na tvrtku u switcheru → odmah u poslovnom modu te tvrtke

## Plan izmjena

**Datoteka: `src/contexts/AppStateContext.tsx`**

1. `businessModeEnabled` početna vrijednost → uvijek `false` pri startu (kao i sad), ali bez brisanja `active_business_profile_id`
2. `activeBusinessProfileId` početna vrijednost → čita iz `localStorage.getItem('active_business_profile_id')` umjesto `null`
3. Ukloniti `localStorage.removeItem('active_business_profile_id')` iz inicijalizacije
4. U `setBusinessModeEnabled(false)` — NE brisati `active_business_profile_id` (samo ugasiti view, zadržati pamćenje tvrtke)

**Validacija (u postojećem `useEffect` koji razrješava onboarding):**
- Ako spremljeni `active_business_profile_id` više ne postoji u bazi (obrisana tvrtka), tiho ga obrisati iz localStorage

## Što se NE dira
- `BusinessProfileSwitcher.tsx` — već radi ispravno, samo će sada vidjeti spremljeni ID
- `BusinessModeGuard.tsx` — netaknut
- Push/in-app notifikacije — netaknute (kako si tražio)
- Auto-generirani fileovi

## Rezultat
- Otvoriš app → osobni mod (zaštićeno)
- Zaglavlje pokazuje: "Osobno ▼" + ispod u dropdownu tvoja zadnja tvrtka spremna
- Jedan klik → poslovni mod aktivne tvrtke
- Kad u poslovnom modu klikneš "Osobno" → vraćaš se u osobni, ali tvrtka ostaje zapamćena za sljedeći put
