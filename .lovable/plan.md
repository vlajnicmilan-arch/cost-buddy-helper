## Problem (ukratko)

Nakon zadnje izmjene kartica projekata, aplikacija ruši s React error #310 ("Rendered more hooks than during the previous render"). To uzrokuje da `ErrorBoundary` prikazuje crveni ekran "Ups, nešto je pošlo po krivu" i izgleda kao da je korisnik odjavljen — **iako prijava savršeno radi** (potvrđeno u auth logovima: uspješan login u 10:37:43).

Uzrok: u `src/components/home/ActiveProjectsStrip.tsx` rani izlazi (`return null`) za nepodržane modove postavljeni su **iznad** poziva `useMemo`. To krši "Rules of Hooks" — kad se kontekst promijeni (npr. promjena moda), broj pozvanih hooks-a se mijenja i React puca.

## Što ću napraviti

**Jedan file, jedna izmjena, bez funkcionalnih promjena.**

`src/components/home/ActiveProjectsStrip.tsx`:
1. Premjestiti `useMemo` (izračun `activeProjects`) **iznad** ranih izlaza, tako da se hook uvijek poziva.
2. Rane izlaze (`if (simpleModeEnabled...) return null`, `if (!hasAccess) return null`) staviti **ispod** svih hook poziva.

```text
PRIJE (krivo):                 POSLIJE (ispravno):
─────────────────              ─────────────────
useTranslation()               useTranslation()
useNavigate()                  useNavigate()
useFeatureAccess()             useFeatureAccess()
useHaptics()                   useHaptics()
useCurrency()                  useCurrency()
                               useMemo(...)         ← uvijek se zove
if (mod) return null   ← puca  
if (!access) return null       if (mod) return null
                               if (!access) return null
useMemo(...)           ← preskočen
```

## Što NEĆE biti promijenjeno
- Vizualni izgled kartica (semafor, KPI brojka, layout)
- Logika izračuna profita/gubitka/zdravlja
- i18n prijevodi
- Bilo koja druga komponenta osim ove jedne

## Rizik
**Minimalan.** Riječ je o standardnom React patternu — preslagivanje 5 linija. Aplikacija će ponovno raditi kao prije, plus nova zdrava UX kartica.

## Što korisnik treba napraviti nakon popravka
Samo **osvježiti stranicu** (pull-to-refresh ili klik "Osvježi stranicu" na crvenom ekranu). Sesija je još uvijek aktivna na serveru, samo je client-side React tree pukao.
