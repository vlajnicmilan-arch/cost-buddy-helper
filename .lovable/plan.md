## Cilj
Eliminirati lažne pozitive u "Vjerojatno postoji" sekciji pri uvozu izvoda (npr. LUKOIL ↔ LESNINA samo zato što oba imaju "SPLIT" u nazivu).

## Promjene — sve u `src/lib/duplicateDetection.ts`

### 1. Proširi `normalizeMerchant` (strip geo/country šum)
Dodati listu HR gradova + country oznaka koje se filtriraju prije word-splita:
```
split, zagreb, rijeka, osijek, zadar, pula, sibenik, dubrovnik, varazdin,
karlovac, vinkovci, sisak, slavonski, brod, bjelovar, kastel, supetar,
trogir, makarska, samobor, koprivnica, krapina, cakovec, gospic,
velika, gorica, hrv, hrvatska, hr, eur, eu
```
Rezultat: `"LUKOIL POLJUD SPLIT HRV"` → `"lukoil poljud"`; `"LESNINA H PC SPLIT"` → `"lesnina h pc"`.

### 2. Pooštri `areMerchantsSimilar`
Trenutno: `common.length / minLen >= 0.5` (jedna zajednička riječ dovoljna).
Novo:
```
if (common.length >= 2) return true;
return common.length / minLen >= 0.6 && minLen >= 2;
```
Single-word merchanti (LIDL vs LIDL) i dalje rade preko `na === nb` / `includes` grane (linija 72–74) — ne mijenjamo je.

### 3. Pooštri "suspicious" tier pragove (linije 238–257)
- iznos: `within5pct` → **`within1pct`** (`amtDelta / max(|txAmt|, 0.01) <= 0.01`)
- datum: `isWithinSameWeek` (≤7d) → **`days <= 2`**
- merchant uvjet ostaje, ali sada koristi pooštreni `areMerchantsSimilar` + očišćeni `normalizeMerchant`

Razlog: pokriva samo realne slučajeve (pretplata s par centi razlike zbog tečaja, vikend booking delay), eliminira slučajne susjede.

### 4. Testovi — `src/lib/duplicateDetection.test.ts`
Dodati regresijske slučajeve:

**Negativni (moraju biti `unique`):**
- LUKOIL POLJUD/SPLIT/HRV 47,69 vs LESNINA H PC SPLIT 45,89, isti dan
- SPLIT - SUPETAR 41,30 vs LIDL HRVATSKA 215 Split 40,85, 4 dana razmaka
- TOMMY ZAGREB vs KONZUM ZAGREB istog iznosa istog dana (samo "zagreb" zajedničko → strip-ano)

**Pozitivni (moraju ostati `suspicious`):**
- NETFLIX 9,99 vs NETFLIX 10,09 (1% razlike), 2 dana razmaka, isti merchant
- HEP ELEKTRA 45,20 vs HEP ELEKTRA 45,60 (0.88%), isti dan

**Pozitivni (moraju ostati `strict`/`fuzzy`):**
- LIDL točan iznos isti dan → strict
- LIDL točan iznos +2 dana → fuzzy

## Što NE diramo
- `useExpenseCRUD.ts`, auto-merge flow (`manualMatchForImport.ts`)
- UI duplikat dijaloga
- `checkDuplicate` (manual entry) — ostaje strict
- DB / migracije — nije potrebno
- i18n keys — postojeći `duplicates.reason.*` ostaju

## Verifikacija
1. `npm test` — svi postojeći + 7 novih testova prolaze
2. Korisnik ponovo uvozi isti izvod → "Vjerojatno postoji" sekcija prazna ili sadrži samo realne kandidate

## Update memorije
Nakon implementacije ažurirati `mem://features/transaction-duplicate-detection-v2` s novim pragovima (suspicious: ±1% iznosa, ±2 dana, ≥2 common merchant words; geo stop-words).
