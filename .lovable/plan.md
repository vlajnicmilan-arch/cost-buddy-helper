## Što je uzrok (jednostavno)

Sva tri problema dijele isti korijen ili su povezani lancem:

### 1) "Sken" gumb ne prepoznaje izvor plaćanja, "Dodaj → Fotografiraj" prepoznaje

Razlog: `Sken` otvara globalni dijalog s `autoScan=true`. Dijalog se mounta i 150 ms kasnije pokrene kameru. AI poziv (`scanReceipt`) šalje **listu prilagođenih izvora** kako bi mogao dodijeliti `custom:UUID`. Ali u trenutku `autoScan` poziva, `useCustomPaymentSources()` još nije dohvatio podatke iz Cloud-a — lista je prazna. AI dobije prazan popis i vrati generičko `bank`/`cash` umjesto konkretnog izvora.

Kod "Dodaj → Fotografiraj" korisnik prvo otvori dijalog, vidi formu, i tek onda pritisne kameru — dotad su izvori već stigli, AI dobije popis i mapiranje radi.

### 2) Pozajmica vlasnika se ne stvara

`createOwnerLoanIfCrossMode` u `useExpenseCRUD` provjerava da li je `payment_source` u formatu `custom:UUID` koji pripada drugom (osobnom) profilu. Ako je AI iz problema #1 vratio generičko `bank`, izvlačenje UUID-a je `null` → izlogiran kao **ne-cross-mode** → pozajmica se ne kreira. Transakcija završi vezana uz tvrtku (`business_profile_id` postavljen) ali bez veze s osobnim izvorom, pa nema "pozajmice".

### 3) Duplikat (isti račun 2x) ne aktivira upozorenje

`checkDuplicate` (strict) traži ISTI tip + ISTI iznos + ISTI dan + (sličan trgovac ILI da jedan opis sadrži drugi). Kada je u problemu #1 prvi sken spremljen s generičkim podacima (npr. opis "Račun"), a drugi sken vratio drugačiji opis (AI ne vraća isti tekst svaki put), uvjet "merchant_name sličan" pada ako je merchant prazan ili različito napisan (npr. "KAUFLAND" vs "Kaufland Zagreb d.o.o."), a `description` provjera padne ako se opisi previše razlikuju. Plus: pretvaranje opisa u "Račun" (fallback iz `applyScannedResult`) radi opis koji se ne preklapa između dvije slike.

---

## Plan popravka (3 kirurška zahvata)

### A. Spriječiti `autoScan` prije nego se izvori učitaju

**File:** `src/components/add-expense/AddExpenseDialog.tsx`

- Dohvatiti i drugu vrijednost iz `useCustomPaymentSources` koja signalizira "učitano" (`isLoading` ili izvedeno `loaded` flag). Ako hook ne nudi takav flag, dodati ga u `src/hooks/useCustomPaymentSources.ts` (vraćati `loading: boolean`).
- U `useEffect` za autoScan (oko linija 340–364) dodati uvjet `&& !customPaymentSourcesLoading`. Ako je još `loading`, ne pokretati kameru — useEffect će se sam ponovno pokrenuti kada se `loading` promijeni.
- Ovim se "Sken" ponaša identično kao "Dodaj → Fotografiraj" — AI uvijek dobije popunjenu listu izvora.

### B. Robusniji fallback za pozajmicu vlasnika kada AI vrati generičko `bank`/`cash` u poslovnom modu

**File:** `src/components/add-expense/AddExpenseDialog.tsx` → funkcija `acceptScannedData` (oko linije 587–610)

- Pojačati postojeću `business mode` validaciju: ako je `effectiveBusinessProfileId` postavljen i `finalPaymentSource` NIJE `custom:UUID` (tj. AI je vratio generičko `bank`/`cash`), **blokirati spremanje** s jasnom porukom (i18n ključ `business.payment.requirePaymentSource`, već postoji): "Odaberi konkretan izvor plaćanja prije spremanja (poslovni ili osobni)."
- Time prisiljavamo korisnika da u dropdownu odabere konkretan izvor. Ako odabere osobni → već postojeći `createOwnerLoanIfCrossMode` u `useExpenseCRUD` (linije 158–169) automatski stvara zapis "Pozajmica vlasnika".
- Ne diramo `useExpenseCRUD` — logika tamo je ispravna.

### C. Pouzdanija detekcija duplikata za skenirane račune

**File:** `src/hooks/useExpenses.ts` → `checkDuplicate` (oko linije 170–207)

- Dodati treću "match" granu prije nego vratimo `null`: ako je `existing.merchant_name` ili `transaction.merchant_name` prazan, provjeriti **ako se kategorija i iznos i dan već poklapaju** (tj. dva entry-ja istog dana, istog iznosa, istog tipa, iste kategorije) — to već u praksi predstavlja duplikat skeniranja, čak i kad opis varira.
- Ostavlja se postojeća stroga logika za ručni unos netaknutom; samo proširenje match grane (i dalje sve mora biti ISTI dan + ISTI tip + ISTI iznos).

**File:** `src/components/add-expense/AddExpenseDialog.tsx` → `acceptScannedData` (oko linije 648–656)

- U `checkDuplicate` pozivu prosljeđivati stvarni `finalType` (`'expense' | 'income' | 'transfer'`), ne hardkodirano `'expense'`. Sada duplikat scanned income-a ili transfera prolazi neopaženo.

---

## Tehnički sažetak (za interno čitanje)

| Promjena | Datoteka | Linije (orijentacijski) | Veličina |
|---|---|---|---|
| Vratiti `loading` flag iz hooka | `src/hooks/useCustomPaymentSources.ts` | n/a | ~5 redaka |
| Čekati `loading` u autoScan effect-u | `src/components/add-expense/AddExpenseDialog.tsx` | 162, 340–364 | ~5 redaka |
| Pooštrena validacija izvora u poslovnom modu | `src/components/add-expense/AddExpenseDialog.tsx` | 598–610 | ~3 retka |
| Proslijediti stvarni `type` u checkDuplicate | `src/components/add-expense/AddExpenseDialog.tsx` | 648–656 | ~2 retka |
| Treća match-grana u `checkDuplicate` | `src/hooks/useExpenses.ts` | 193–204 | ~6 redaka |

**Što ostaje netaknuto:** `useExpenseCRUD` (owner-loan logika je već dobra), `ownerLoanLogic.ts`, `parse-receipt` edge funkcija, RLS, baza, i18n (koristimo postojeće ključeve).

**Bez DB migracije, bez novih edge funkcija, bez UI redizajna.**

Nakon ovih izmjena:
- Sken s home stranice prepoznaje izvor jednako pouzdano kao Dodaj→Fotografiraj.
- Ako se dogodi da AI ne mapira izvor, korisnik je prisiljen birati eksplicitno → pozajmica vlasnika se onda korektno kreira.
- Drugi sken istog računa (čak i kada se opisi malo razlikuju) bit će uhvaćen kao duplikat.
