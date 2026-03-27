

# AI Asistent: Strogo na podacima, realni savjeti, praćenje ciljeva

## Pregled
Nadogradnja AI asistenta da bude **strogo vezan uz stvarne podatke**, koristi **jednostavan jezik**, daje **realne projekcije** i pomaže korisniku **kreirati i pratiti financijske ciljeve** kroz razgovor.

## Promjene

### 1. Ojačan System Prompt — Anti-halucinacija i jednostavnost
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

Prepisati ključne sekcije system prompta:

- **ZLATNO PRAVILO**: "NIKADA ne izmišljaj podatke. Ako nemaš informaciju — reci to. Svaki broj koji kažeš MORA doći iz alata ili konteksta."
- **Predviđanja**: "Projekcije baziraš ISKLJUČIVO na stvarnim trendovima iz baze. Uvijek naglasi da je to procjena temeljena na X mjeseci podataka, ne garancija."
- **Jednostavan jezik**: "Piši kao da objašnjavaš prijatelju. Bez financijskog žargona osim ako korisnik ne traži. Umjesto 'likvidnost' reci 'koliko novca imaš na raspolaganju'. Umjesto 'diversifikacija' reci 'rasporediti novac na više mjesta'."
- **Razrada planova**: "Kad korisnik želi plan (npr. 'želim uštedjeti za auto'), predloži konkretne korake: koliko mjesečno trebaju štedjeti, koliko dugo, i ponudi da se postavi cilj štednje u aplikaciji."

### 2. Novi alat: `create_savings_goal`
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

Dodati tool koji AI može pozvati iz razgovora:
- Parametri: `name`, `target_amount`, `deadline` (opcionalno), `monthly_contribution` (opcionalno)
- Kreira zapis u `savings_goals` tablici za korisnika
- AI može reći: "Postavio sam ti cilj 'Auto' — 10.000€ s mjesečnom uplatom od 500€. Želiš li nešto promijeniti?"

### 3. Novi alat: `update_savings_goal`
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

- Parametri: `goal_id`, `current_amount` (dodaj iznos), `target_amount`, `name`
- Omogućuje AI-u da ažurira ciljeve kroz razgovor

### 4. Novi alat: `get_goal_progress`
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

- Dohvaća sve ciljeve s izračunom: postotak ostvarenosti, koliko još treba, procjena vremena do cilja na temelju prosjeka štednje zadnja 3 mjeseca
- AI koristi ovo za realne izvještaje: "Do sada si uštedio 2.500€ od 10.000€ (25%). Zadnja 3 mjeseca štediš prosječno 450€/mj — po tom tempu trebat će ti još ~17 mjeseci."

### 5. Zaštita od halucinacija u kodu
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

- U system prompt dodati eksplicitne zabrane:
  - "NE koristi fraze poput 'prema mojim procjenama' bez pozivanja alata"
  - "Kad daješ projekciju, OBAVEZNO navedi na koliko podataka se temeljš (npr. 'Na temelju 47 transakcija u zadnja 3 mjeseca')"
  - "Ako korisnik pita nešto za što nemaš podatke u bazi, reci: 'Nemam dovoljno podataka o tome. Možeš li unijeti [X] pa ću ti dati točniju analizu?'"

### 6. Razgovorni pristup ciljevima
U system promptu dodati sekciju za interaktivno planiranje:
- "Kad korisnik izrazi želju (npr. 'želim smanjiti troškove'), NE daj odmah savjet. Prvo pitaj: 'Na što misliš konkretno? Koja kategorija te brine?' pa tek onda analiziraj."
- "Kad predlažeš plan, podijeli ga u korake i pitaj korisnika slaže li se s korakom 1 prije nego nastaviš."

## Tehnički detalji

Novi toolovi u `tools` nizu:
```text
create_savings_goal  → INSERT u savings_goals (user_id, name, target_amount, deadline)
update_savings_goal  → UPDATE savings_goals SET ... WHERE id = goal_id AND user_id = userId  
get_goal_progress    → SELECT iz savings_goals + izračun tempa štednje iz expenses
```

Promjene u system promptu (~30 linija zamjene/dodavanja u sekcijama TVOJA ULOGA, PRAVILA, i nova sekcija ANTI-HALUCINACIJA).

Sve promjene su u jednoj datoteci: `supabase/functions/financial-assistant/index.ts`

