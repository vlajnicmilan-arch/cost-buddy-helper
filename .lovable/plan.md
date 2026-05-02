## Problem

Kad se vraćaš na Pregled iz Novčanika ili druge sekcije, **na sekundu** se vidi 5 računa, pa skoči na 4 (jer je jedan sakriven). Razlog:

1. `useHiddenPaymentSources` se poziva u 3 odvojene komponente (`PersonalModeView`, `PaymentSourcesSection`, `CustomPaymentSourcesPanel`) — svaka ima vlastiti `useState(new Set())` koji **kreće prazan**.
2. Hook radi async Supabase fetch tek nakon mounta → 100–400 ms se prikazuju SVI izvori (kao da nijedan nije sakriven).
3. `useExpenseFetch` ima dodatni vlastiti fetch istih podataka (4. fetch po povratku).
4. Nema persistencije između navigacija → svaki povratak na Pregled = novi fetch = novo treptanje.

## Rješenje

Module-level cache (singleton) koji:
- pamti `hiddenIds` između navigacija unutar iste sesije,
- seedan iz `sessionStorage` već **pri prvom renderu** (sinkrono, prije nego React mountira komponente),
- dijeljen kroz svih 4 konzumenata kroz mali pub/sub pattern,
- i dalje fetcha iz Supabase u pozadini za prvu autentikaciju i osvježavanje (ali tek nakon što UI već prikazuje točno stanje).

Rezultat: kad se vratiš na Pregled, hidden state je **odmah dostupan** iz cachea, nema treptanja.

Ne diramo:
- bazu, RLS, migracije,
- toggleHidden logiku (write path),
- filtriranje u `useExpenseFetch.dashboardExpenses`,
- ponašanje u Local modu (samo čitanje iz localStorage je već sinkrono).

## Tehnička implementacija

### 1. `src/hooks/useHiddenPaymentSources.ts` — refactor na shared cache

Dodati na vrh fajla (izvan hooka):

```ts
// Module-level singleton cache
let cachedIds: Set<string> | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(s: Set<string>) => void>();
const SESSION_KEY = 'dashboardHiddenSources:cache';

// Synchronous seed from sessionStorage on module load
try {
  const seed = sessionStorage.getItem(SESSION_KEY);
  if (seed) cachedIds = new Set(JSON.parse(seed) as string[]);
} catch { /* ignore */ }

const persistSession = (ids: Set<string>) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
};

const setCache = (next: Set<string>) => {
  cachedIds = next;
  persistSession(next);
  listeners.forEach(l => l(next));
};
```

Hook postaje:

```ts
export const useHiddenPaymentSources = () => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const isLocalMode = storageMode === 'local' && !user;

  // CRITICAL: initialize from cache synchronously — no flicker
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => cachedIds ?? new Set());
  const [loading, setLoading] = useState(cachedIds === null);

  // Subscribe to cache updates from other instances
  useEffect(() => {
    const listener = (s: Set<string>) => setHiddenIds(s);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const fetchHidden = useCallback(async () => {
    if (isLocalMode) {
      try {
        const stored = localStorage.getItem(LOCAL_KEY);
        const parsed = stored ? (JSON.parse(stored) as string[]) : [];
        setCache(new Set(parsed));
      } catch { setCache(new Set()); }
      setLoading(false);
      return;
    }
    if (!user) { setCache(new Set()); setLoading(false); return; }

    // Deduplicate concurrent fetches across all hook instances
    if (inFlight) { await inFlight; setLoading(false); return; }

    inFlight = (async () => {
      try {
        const { data, error } = await supabase
          .from('dashboard_hidden_sources' as any)
          .select('source_id')
          .eq('user_id', user.id);
        if (error) throw error;
        setCache(new Set((data || []).map((r: any) => r.source_id as string)));
      } catch (err) {
        console.error('Error fetching hidden payment sources:', err);
        if (cachedIds === null) setCache(new Set());
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
    setLoading(false);
  }, [user, isLocalMode]);

  useEffect(() => { fetchHidden(); }, [fetchHidden]);
  // ... rest unchanged (toggleHidden, isHidden, refetch, event listener)
};
```

`toggleHidden` već optimistično postavlja state — promijeniti `setHiddenIds(next)` u `setCache(next)` da se promjena propagira svim instancama bez čekanja eventa.

Na revertu greške: `setCache(hiddenIds)`.

### 2. `src/hooks/useExpenseFetch.ts` — ukloniti duplikat fetcha

Ima vlastiti `fetchHiddenSources` koji radi isto što i hook. Zamijeniti pozivom hooka:

```ts
import { useHiddenPaymentSources } from './useHiddenPaymentSources';
// ...
const { hiddenIds: hiddenPaymentSourceIds } = useHiddenPaymentSources();
```

Maknuti:
- lokalni `useState<Set<string>>(new Set())` za `hiddenPaymentSourceIds`,
- `fetchHiddenSources` callback,
- `fetchHiddenSources()` poziv iz initial load `useEffect`a,
- event listener za `hidden-payment-sources-changed` (hook to već radi interno).

Dependency array u `dashboardExpenses` `useMemo` ostaje isti (`hiddenPaymentSourceIds`).

### 3. Logout cleanup

U `useAuth` postoji signOut. Provjerit ću i u tom mjestu očistiti cache:

```ts
// nakon supabase.auth.signOut()
sessionStorage.removeItem('dashboardHiddenSources:cache');
```

Ako je jednostavnije, dodati listener na auth state change u samom modulu hooka:

```ts
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    cachedIds = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    listeners.forEach(l => l(new Set()));
  }
});
```

Ovo je sigurnije — cache se automatski briše kad se korisnik odjavi.

## Ponašanje nakon promjene

- **Prvi posjet u sesiji** (cold start): kratki async fetch; ako brži način — UI nakratko može pokazati sve izvore. Acceptable, događa se jednom po sesiji.
- **Svaki sljedeći povratak na Pregled**: cache je već pun → instant točno stanje, bez treptanja.
- **Reload stranice**: sessionStorage seed odmah popuni cache prije prvog rendera → nema treptanja čak ni nakon F5.
- **Toggle u Novčaniku**: `setCache` odmah obavještava sve instance (PersonalModeView, PaymentSourcesSection, ...) — sinkrono, bez round-tripa kroz event.
- **Promjena korisnika**: SIGNED_OUT cleanup briše cache.

## Verifikacija

1. Uključi/sakrij jedan izvor → vrati se na Pregled → otvori Novčanik → vrati se na Pregled. Broj računa mora **odmah** biti ispravan, bez bljeska.
2. Reload stranice (F5) na Pregledu sa sakrivenim izvorom → mora odmah pokazati ispravan broj.
3. Logout + login s drugim računom → ne smiju se vidjeti tuđi sakriveni izvori.
4. Saldo na Dashboardu (Saldo/Prihodi/Rashodi) i dalje ispravno isključuje sakrivene izvore — `useExpenseFetch` sada čita iz istog cachea, dakle sinkronizirano.
