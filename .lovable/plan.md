## Retroaktivni reclassification: Aircash "Uplata gotovine" income → transfer

### Što
UPDATE 5 postojećih redaka u `expenses` tablici (svi pripadaju jednom useru, svi na Aircash payment source `custom:0716b12f-6723-4b60-a089-673e8187df0d`):

- `07e6ebc5…` — 02.06.2026, 300 €
- `b0721a6e…` — 02.06.2026, 500 €
- `6c96d661…` — 14.05.2026, 200 €
- `176b37d3…` — 12.05.2026, 100 €
- `dbcd7711…` — 09.05.2026, 100 €

Promjena: `type = 'income'` → `type = 'transfer'`.

### Što NE diram
- **Saldo Aircash izvora ostaje netaknut.** Ovo su realni cash top-upovi koji su već uvećali saldo Aircash računa. Reclassification je samo radi klasifikacije (da ne ulaze u "ukupni prihod" u izvještajima). Suprotni „cash" izvor ne postoji jer gotovina nije tracked source.
- `income_source_id`, `amount`, `payment_source`, `date`, `description` — sve ostaje isto.
- Ostali useri i transakcije — ne diram.

### Izvedba
Kroz `supabase--insert` tool (UPDATE = data change, ne schema), s eksplicitnim WHERE po 5 ID-jeva da nema slučajnog prelijevanja.

### Rizici / napomene
- Ako se igdje u kodu transfer NE filtrira iz "prihoda" (npr. custom report koji broji sve osim `expense`), te će se brojke smanjiti za 1200 €. Provjera: `useExpenseFetch` i budget calc već isključuju transfer (vidi memory).
- Ako user u međuvremenu obriše neki od ovih redaka prije approvala, UPDATE će ga preskočiti (deleted_at filter).
- Bez backfilla za buduće importe — nova `reclassifyInternalTransfers` logika već radi posao automatski.
