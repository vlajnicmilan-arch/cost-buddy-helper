

## Preporuka: Da, isključi poslovni mod kod cold starta

Stručno gledano, ovo je **najsigurniji i najintuitivniji pristup** iz tri razloga:

1. **Sigurnost podataka** — ako korisnik slučajno doda transakciju misleći da je u osobnom modu, a zapravo je u poslovnom (ili obrnuto), transakcija završi u krivoj tvrtki. Ovo si upravo doživio kao "katastrofu" iako podaci nisu bili izgubljeni.
2. **Princip najmanjeg iznenađenja** — osobni mod je "default" za većinu dnevnih unosa (kava, namirnice, gorivo). Poslovni mod je svjesna odluka koju korisnik donosi kad sjedne raditi knjigovodstvo.
3. **Vidljivost** — kad se app otvori u osobnom modu, odmah vidiš svoje izvore plaćanja i transakcije; nema dvojbe "gdje sam".

## Trenutno stanje (provjereno u kodu)

`AppStateContext` već **postavlja `business_mode_enabled = false` na svakom mountu** (linija ~70). Znači kod je **već dobar za session view**. Problem koji si imao bio je što je **`active_business_profile_id`** ostao u localStorage pa je `BusinessProfileSwitcher` (ili neka komponenta po mountu) **automatski reaktivirao** poslovni view.

Trebam kratko provjeriti gdje se točno reaktivira (BusinessProfileSwitcher ili neki guard) i blokirati tu auto-reaktivaciju kod cold starta.

## Što ću napraviti

### `src/contexts/AppStateContext.tsx`
- Dodati flag `coldStartCompleted` u sessionStorage (NE localStorage — sessionStorage se briše kod zatvaranja taba/app procesa)
- Kod inicijalizacije: ako `coldStartCompleted` ne postoji → ovo je svježi start → forsirati `businessModeEnabled = false` i postaviti flag
- `active_business_profile_id` ostaje u localStorage (da se pamti zadnja tvrtka), ali **se ne aktivira automatski**

### `src/components/BusinessProfileSwitcher.tsx`
- Provjeriti i (ako postoji) ukloniti auto-aktivaciju koja čita `active_business_profile_id` i odmah poziva `setBusinessModeEnabled(true)` po mountu
- Switcher i dalje prikazuje zadnju tvrtku kao "zapamćenu" — korisnik je vidi i jednim klikom aktivira

### Ponašanje nakon izmjene
- **Cold start** (zatvoriš app, ponovno otvoriš) → uvijek u Osobnom modu, zadnja tvrtka vidljiva u switcheru ali neaktivirana
- **Tijekom sesije** → ako prebaciš na poslovni mod, ostaje aktivan dok ne prebaciš nazad ili zatvoriš app
- **Master switch u Postavkama** → ostaje netaknut, kontrolira samo hoće li poslovne značajke biti dostupne uopće

## Što se NE dira
- `active_business_profile_id` u localStorage (zadržava se)
- Master switch `business_feature_enabled` (zadržava se)
- Bilo kakav nativni kod ili APK (samo web izmjena, Live Sync)
- Skeniranje računa i ostali popravci iz prošlih rundi

## Datoteke za izmjenu
- `src/contexts/AppStateContext.tsx` (flag za cold start)
- `src/components/BusinessProfileSwitcher.tsx` (ukloniti auto-aktivaciju ako postoji)

## Rezultat
Više se ne može dogoditi da otvoriš app i misliš da su ti podaci nestali — uvijek krećeš s vlastitog osobnog pregleda, a poslovni mod je jedan svjestan klik daleko.

