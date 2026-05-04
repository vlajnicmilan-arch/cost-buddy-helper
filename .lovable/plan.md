# Instant Cache — uklanjanje spinnera pri povratku u app

## Cilj
Pri svakom povratku u app prikazati zadnje poznato stanje **odmah** (bez spinnera/praznog ekrana), a u pozadini tiho povući svježe podatke i ažurirati UI.

## 1. Novi helper: `src/lib/instantCache.ts`

Mali (~50 linija) wrapper oko `sessionStorage` s `localStorage` fallbackom za perzistenciju preko zatvaranja appa.

```ts
read<T>(key: string): T | null
write<T>(key: string, data: T): void
remove(key: string): void
clearAll(): void  // briše sve "cache:*" ključeve (logout)
```

- Custom JSON replacer/reviver za `Date` objekte (ključno za `expenses[].date`).
- Tiho hvata `QuotaExceededError` i greške parsanja (samo `console.warn`, ne prekida flow).
- Verzionirani ključevi (`v1`) za lakšu invalidaciju kad se shape promijeni.

## 2. Cache ključevi (per user + kontekst)

- `cache:projects:v1:{userId}:{activeBusinessProfileId|personal}`
- `cache:paymentSources:v1:{userId}:{activeBusinessProfileId|personal}:{includePersonal}`
- `cache:expenses:v1:{userId}:{viewMode}:{viewBusinessProfileId|none}`

Kontekst u ključu = nema curenja podataka između Personal/Business profila.

## 3. Izmjene u `useProjects.ts`

- Na mountu: pročitaj cache za trenutni `(user, activeBusinessProfileId)`.
  - Ako postoji → `setProjects(cached)` + `setLoading(false)` **odmah**.
  - Ako ne postoji → ostavi `loading=true` (kao sada).
- `fetchProjects` ne radi `setLoading(true)` ako već imamo nešto u stateu (silent revalidate).
- Nakon uspješnog fetcha → `setProjects(fresh)` + `instantCache.write(...)`.

## 4. Izmjene u `useCustomPaymentSources.ts`

Identičan pattern kao kod projekata, ključ uključuje `includePersonal` flag.

## 5. Izmjene u `useExpenseFetch.ts`

- Cache se sprema **prije** primjene `applyViewMode` filtera (sirovi `expenses` array, jer `viewMode` se mijenja runtime).
- Datumi se serijaliziraju kroz custom replacer; pri čitanju, helper vraća `Date` objekte (čime ostaje kompatibilno s postojećim `e.date.getTime()` pozivima).
- Realtime subscription i ostala logika ostaju netaknute.
- Local storage mode (`isLocalMode`) preskače cache (već je instant).

## 6. Invalidacija na logout

U `useAuth` (ili gdje god se zove `supabase.auth.signOut()`) pozvati `instantCache.clearAll()`. Tako sljedeći user neće vidjeti tuđe podatke ni na trenutak.

## 7. Što se NE mijenja

- RLS, business filteri, fetch logika, paginacija, retry on 401
- Realtime subscription u `useExpenseFetch`
- TanStack Query hooks (već imaju staleTime 5min)
- Cold start (prvi login) — ostaje isti spinner
- Lokalni storage mode

## Tehnički detalji

**Zašto sessionStorage + localStorage fallback?**
- `sessionStorage`: brži, automatski izoliran po tabu, nestaje pri hard close. Dovoljno za "vratio sam se u app nakon par minuta".
- `localStorage`: perzistira preko zatvaranja appa/Capacitor restarta. Helper čita iz oba (sessionStorage prvo), piše u oba.

**Zašto ne TanStack Query persister?**
- Uvodi dodatnu zavisnost i wrapper oko `QueryClient`, a hookovi `useProjects`/`useCustomPaymentSources`/`useExpenseFetch` ne koriste Query nego `useState`. Refaktor bi bio značajno veći.

**Memorijska sigurnost:**
- Maksimalna veličina ~5MB po origin (sessionStorage limit). Tipičan user: par stotina expenses + par desetaka projekata = <500KB. Ako prijeđemo limit, `QuotaExceededError` se hvata tiho.

## Rezultat
- Cold start: kao sada (~1-2s spinner)
- Svaki sljedeći povratak u app: **instant prikaz** zadnjeg stanja, tiho ažuriranje u pozadini
- Realtime promjene: i dalje stižu odmah preko subscription kanala
