

# Plan: Dohvat svih transakcija iz baze (bez limita od 1000)

## Problem

Supabase ima **default limit od 1000 redova** po upitu. Korisnik ima **1012 transakcija**, pa se zadnjih 12 gubi. PBZ Solin ima 62 transakcije ukupno, ali dio nije dohvaćen jer spada u onih "odrezanih".

## Rješenje

### `src/hooks/useExpenseFetch.ts`

Zamijeniti jednostavan `.select('*')` poziv s **paginiranim dohvatom** koji iterira u blokovima od 1000 redova dok ne dohvati sve:

```typescript
// Fetch all expenses with pagination (Supabase max 1000 per request)
let allData: any[] = [];
let from = 0;
const pageSize = 1000;

while (true) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw error;
  if (!data || data.length === 0) break;
  allData = allData.concat(data);
  if (data.length < pageSize) break;
  from += pageSize;
}
```

Ostatak koda (mapiranje `allData` u `Expense[]`) ostaje isti — samo se `data` zamijeni s `allData`.

## Datoteke

| Datoteka | Promjena |
|---|---|
| `src/hooks/useExpenseFetch.ts` | Paginirani dohvat umjesto jednog upita |

