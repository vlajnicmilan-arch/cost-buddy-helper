## Hitno: vraćanje na sigurno stanje

Moja prošla izmjena je krivo povezala chip "Tvrtka" s `setBusinessModeEnabled(true)` i `setActiveBusinessProfileId(...)`. Te dvije zastavice okidaju cijeli **Business Mode** u `Index.tsx` (`isBusinessMode = businessFeatureEnabled && businessModeEnabled && !!activeBusinessProfileId`), što:

- prebacuje render iz `PersonalModeView` u `BusinessModeView` ("novi prozor" koji vidiš),
- mijenja BottomNav i ulazi u izolaciju projekata po tvrtki → tvoji **osobni projekti** se ne prikazuju jer su filtrirani po `business_profile_id` aktivne tvrtke.

**Projekti NISU obrisani** — samo su sakriveni jer si u Business modu. Vraćanjem chipa na čisto "view-only" stanje opet će se vidjeti.

### Što ću napraviti (samo 1 datoteka)

**`src/contexts/WalletViewModeContext.tsx`** — vratiti na vlastiti `useState` + `localStorage` (kao prije moje izmjene), bez ikakvog diranja `AppStateContext`.
- Chip "Osobno"/"Tvrtka" mijenja **samo** lokalni `mode` (filter za prikaz),
- NE dira `businessModeEnabled` ni `activeBusinessProfileId`,
- `BusinessProfileSwitcher` u headeru (s natpisom "Privatno/Tvrtka") ostaje JEDINI način za stvarno ulaženje u Business Mode.

`useExpenseFetch.ts` i `WalletViewModeChips.tsx` ostaju kako jesu (tip `'personal' | business:<uuid>` je i dalje točan, ne treba revert tamo).

### Posljedica

- Projekti se odmah vraćaju (kad chip bude opet samo filter, `Index.tsx` ostaje u Personal modu).
- Originalan problem (saldo/neto vrijednost ne reagiraju na chip) **ostaje neriješen** — to ćemo zatim riješiti drugim putem koji NE dira business mode (npr. `useCustomPaymentSources` da gleda i `WalletViewMode` kad nije u Business modu).

### Sljedeći korak nakon revert-a

Predložit ću novi, minimalan plan koji rješava saldo/izvore preko proširenja `useCustomPaymentSources` da poštuje `WalletViewMode` kad je `businessModeEnabled === false`. Bez diranja layouta, BottomNav-a, projekata.
