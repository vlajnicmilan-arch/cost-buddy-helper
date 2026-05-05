## Root cause (provjereno)

`src/components/WelcomeChecklist.tsx` ima **hook iza ranog returna**:

- Linije 62, 66: `if (loading || subLoading) return null;` i `if (isPaid) return null;`
- Linija 71: `useEffect(...)` — pozove se samo ako prošle dvije provjere ne vrate.

To krši React Rules of Hooks. Broj pozvanih hookova mijenja se između rendera (npr. dok subscription učita pa kad se provjeri `isPaid`). React tada baci `Rendered more hooks than during the previous render`. Na Android WebView-u ta runtime greška u kombinaciji s `framer-motion AnimatePresence` ruši cijeli WebView proces — što odgovara simptomu (APK se zatvori par sekundi nakon otvaranja).

Bug je uveden u commit `f04a1a4b "Ispravljen render sadržaja"` koji je sada HEAD nakon reverta.

## Fix (jedna datoteka, bez novog APK builda)

**`src/components/WelcomeChecklist.tsx`** — premjestiti `allDone` izračun i `useEffect` za auto-dismiss **iznad** svih ranih `return null`. Logika ostaje identična, samo je redoslijed hookova stabilan u svakom renderu.

Bez novih guardova, timeoutova, niti drugih izmjena.

## Zašto bez novog APK builda

`capacitor.config.ts` ima `server.url: 'https://vmbalance.com/app'` → APK uvijek povlači živi web bundle. Čim Lovable objavi novu verziju, telefon na sljedećem otvaranju automatski dobije popravljeni JS.

## Verifikacija

- Otvoriti app na telefonu — više se ne smije zatvoriti.
- Welcome checklist i dalje skriven za paid/admin korisnike (guard je samo premješten, ne uklonjen).
