## Cilj
Dodati mogućnost da korisnik privremeno **sakrije izvor plaćanja** s glavnog dashboarda (i njegovih izračuna), bez brisanja izvora i bez utjecaja na transakcije/povijest. Klik na ikonu oka prebacuje stanje "uključen / isključen iz dashboarda".

## Predloženo rješenje (s malim poboljšanjem u odnosu na originalni opis)

Umjesto ikone koja "samo na klik gasi", koristit ću **toggle ikonu Eye / EyeOff** (Lucide):
- 👁 **Eye** = izvor je vidljiv na dashboardu (default, kao i sada)
- 🚫 **EyeOff** = izvor je sakriven s dashboarda

### Što se događa kada je izvor "sakriven"
1. **Dashboard / glavna stranica**:
   - Saldo izvora ne ulazi u ukupni saldo prikazan na vrhu.
   - Transakcije vezane za taj izvor se **ne broje** u "totalIncome / totalExpenses / balance" za grafove i sažetke na Dashboardu.
   - U mjesečnom grafu trendova, kategorijama i sažecima — isključeno.
2. **Wallet / Novčanik (sve kartice)**:
   - Izvor i dalje postoji i prikazuje se, ali s vizualnom oznakom "sakriven s dashboarda" (smanjena opacity + EyeOff badge).
   - Korisnik može i dalje raditi sve transakcije, vidjeti povijest, uređivati izvor.
3. **Izvještaji, Projekti, Budžeti, Kalendar**:
   - Ostaju **netaknuti** — sakrivanje utječe **samo na Dashboard prikaz/izračun**, jer cilj je "počistiti pogled", ne brisati podatke.
   - U Reports/Project P&L i dalje se prikazuju jer korisnik tamo eksplicitno bira što gleda.
4. **Dropdown za odabir izvora kod nove transakcije**: i dalje je dostupan (samo s diskretnom EyeOff oznakom), da se ne ometa svakodnevni unos.

### Zašto bolje od originala
- Toggle s dvije ikone (Eye/EyeOff) je standardni UX uzorak — odmah je jasno trenutno stanje.
- Ne briše ništa, ne mijenja transakcije, reverzibilno jednim klikom.
- Per-user postavka (svaki član podijeljenog izvora može sakriti za sebe, ne dira druge članove).

## Tehnička implementacija

### Baza
Nova tablica `dashboard_hidden_sources` (per-user toggle):
```
- user_id uuid (FK auth.users, NOT NULL)
- source_id uuid (NOT NULL)  -- ID iz custom_payment_sources
- created_at timestamptz default now()
- PRIMARY KEY (user_id, source_id)
```
RLS: korisnik vidi/upravlja samo svojim retcima (`auth.uid() = user_id`).

Razlog što je u zasebnoj tablici (a ne polje `is_hidden` u `custom_payment_sources`):
- Dijeljeni (shared) izvori — svaki član može sam za sebe sakriti, bez utjecaja na druge.

### Frontend

**Novi hook** `src/hooks/useHiddenPaymentSources.ts`:
- `hiddenSourceIds: Set<string>` — fetch + realtime cache
- `toggleHidden(sourceId)` — upsert/delete
- `isHidden(sourceId)` — helper

**Izmjene**:
- `src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx` i `PaymentSourcesFullScreenView.tsx` — Eye/EyeOff toggle gumb na svakoj kartici izvora (44px touch target, kraj reda); EyeOff dodaje `opacity-60` na kartici.
- `src/hooks/useExpenses.ts` — uvesti novi parametar/filter `excludeHiddenSourceIds`: `dashboardExpenses` filtrira van transakcije čiji `payment_source` (ili `custom:UUID`) je u skupu sakrivenih.
- `src/pages/Dashboard.tsx` — pri prikazu ukupnog stanja sumirati samo balanse izvora koji nisu u `hiddenSourceIds`.
- i18n ključevi (HR/EN/DE): `paymentSources.hideFromDashboard`, `paymentSources.showOnDashboard`, `paymentSources.hiddenBadge`.

### Što NE diramo
- `custom_payment_sources` shema (nema migracije postojećih redaka).
- Logika za projekte, budžete, family, izvještaje.
- RLS i postojeće sharing/permission funkcije.

## Korisničko iskustvo
- Klik na 👁 → 🚫 → izvor odmah nestaje s Dashboard sumarnih kartica + grafova.
- StatusFeedback (1200ms): "Sakriveno s dashboarda" / "Prikazano na dashboardu".
- U novčaniku ostaje vidljiv s blago smanjenom prozirnošću i malom EyeOff oznakom.

## Verifikacija nakon implementacije
1. Osobni mod: sakriti glavni račun → ukupno stanje i graf na Dashboardu se smanji za njegov saldo i transakcije.
2. Poslovni mod: isto, izolirano po `business_profile_id`.
3. Dijeljeni izvor: korisnik A sakrije → korisnik B i dalje vidi normalno.
4. Refresh stranice → stanje sakrivenih izvora se zadržava.
5. HR/EN/DE prijevodi prisutni.
