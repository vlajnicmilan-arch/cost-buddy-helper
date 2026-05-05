Provjerio sam stvarni kod i problem se može objasniti točno, bez nagađanja.

Do I know what the issue is? Da.

Problem nije screenshot ni vizualni CSS. Problem je u stanju aplikacije: nakon zadnjih izmjena postoje dva izvora istine za isti izbor prikaza:

1. `WalletViewModeContext` (`personal` ili `business:<id>`)
2. `AppStateContext` (`activeBusinessProfileId` + `businessModeEnabled`)

Hook `useBusinessViewSync.ts` ih pokušava sinkronizirati u oba smjera kroz dva `useEffect`-a. Ako se pri otvaranju aplikacije vrijednosti razlikuju, efekti rade s vrijednostima iz prethodnog rendera i mogu se početi izmjenjivati ovako:

```text
render 1: mode = personal, activeBusinessProfileId = tvrtka
  effect A postavi activeBusinessProfileId = null
  effect B postavi mode = business:tvrtka

render 2: mode = business:tvrtka, activeBusinessProfileId = null
  effect A postavi activeBusinessProfileId = tvrtka
  effect B postavi mode = personal

... i tako stalno
```

Zato treperi sve: iznosi, kartice, novčanici i transakcije se neprestano prebacuju između osobnog i poslovnog konteksta.

Dodatno sam potvrdio još dvije stvari iz stvarnog koda:
- `HomeHeader.tsx` još uvijek renderira `BusinessProfileSwitcher`, iako je prema memoriji projekta taj switcher u headeru zabranjen. To ne mora biti glavni uzrok petlje, ali zadržava drugi put za promjenu istog stanja i treba ga ukloniti iz dashboard headera.
- `AppStateContext.setBusinessModeEnabled(false)` namjerno ostavlja `activeBusinessProfileId`, a `useCustomPaymentSources` filtrira samo po `activeBusinessProfileId`. To može dovesti do toga da aplikacija izgleda kao osobni mod, ali podaci ostanu poslovni.

Plan popravka:

1. Ukloniti dvosmjerni ping-pong sync
   - Izbaciti poziv `useBusinessViewSync()` iz `Index.tsx`.
   - Prestati koristiti `useBusinessViewSync.ts` kao aktivni mehanizam sinkronizacije.
   - Ne dodavati timeout, guard flag ili privremeni hack.

2. Uvesti jedan izvor istine za dashboard mode
   - `WalletViewModeContext` treba biti vezan uz `AppStateContext`, jer je `AppStateProvider` već iznad njega u `App.tsx`.
   - `mode` se treba izračunavati iz:
     - `businessModeEnabled && activeBusinessProfileId` → `business:<id>`
     - inače → `personal`
   - `setMode('personal')` mora postaviti:
     - `businessModeEnabled = false`
     - `activeBusinessProfileId = null`
   - `setMode('business:<id>')` mora postaviti:
     - `businessModeEnabled = true`
     - `activeBusinessProfileId = id`
   - Time se uklanja potreba za dvosmjernim efektima.

3. Uskladiti dashboard povratak na osobni mod
   - U `BusinessModeView` / `Index.tsx` povratak na osobno neće samo gasiti `businessModeEnabled`; mora očistiti i `activeBusinessProfileId` ili koristiti isti `setMode('personal')` put.
   - Cilj: osobni mod nikad ne smije zadržati aktivni poslovni profil u podatkovnim hookovima.

4. Ukloniti BusinessProfileSwitcher iz HomeHeadera
   - Maknuti `BusinessProfileSwitcher` iz `src/components/home/HomeHeader.tsx`.
   - Context switching ostaje isključivo kroz `WalletViewModeChips`, kako je već zapisano u memoriji projekta.
   - Time dashboard na mobitelu ima samo jedan način promjene osobno/tvrtka.

5. Provjeriti hookove koji hrane iznose
   - `useCustomPaymentSources` mora koristiti efektivni poslovni profil samo kad je poslovni prikaz stvarno aktivan.
   - `useExpenseFetch` mora ostati usklađen s istim modeom.
   - `netWorth`, `PaymentSourcesSection`, `SummarySection`, `ActiveProjectsStrip` i transakcije tada dobivaju stabilne podatke iz jednog konteksta.

6. Mobilna provjera nakon izmjena
   - Testirati na viewportu oko 390x844 / 384px logici.
   - Provjeriti početno otvaranje aplikacije.
   - Provjeriti klik na `Osobno`.
   - Provjeriti klik na tvrtku.
   - Provjeriti povratak iz poslovnog prikaza na osobno.
   - Provjeriti da iznosi više ne osciliraju između osobnog i poslovnog stanja.

Očekivani rezultat:

- Nema više stalnog treperenja.
- Osobni mod prikazuje samo osobne salde, novčanike, slobodno i neto vrijednost.
- Mod tvrtke prikazuje samo salde, novčanike, slobodno i neto vrijednost te tvrtke.
- Nema skrivenog poslovnog profila dok je UI u osobnom modu.
- Nema drugog switchera u headeru koji može razbiti stanje.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>