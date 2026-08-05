# Provjera je li web objava stvarno legla (ispravljena metoda)

## Kriva metoda — ne koristiti

Usporedba `public/version.json` sa živom stranicom **ne dokazuje ništa o web objavi**.
Ta se datoteka mijenja samo pri izradi novog APK-a (`android-build.yml` se okida na njenu
promjenu, `publish-version-manifest` objavljuje manifest nativne ljuske). Web objava je ne dira.
Isti tip zabune već je zabilježen u projektu: verzija nativne ljuske ≠ verzija koda.

## Ispravna metoda

Vite imenuje izlazne datoteke hashom sadržaja.

1. `curl -s https://vmbalance.com/ | grep -oE '(src|href)="/assets/[^"]+"'`
2. `npx vite build` pa isto nad `dist/index.html`
3. Usporediti nazive. Ulazni `index-*.js` je najvažniji.

Dopuna (bitno): hash ulaznog chunka može se razlikovati i kad je izvor isti, jer ovisi o
hashovima lazy chunkova iz build okoline. Zato je konačan dokaz **usporedba sadržaja**:
skinuti živi chunk i potražiti u njemu niz koji postoji samo u novom kodu
(npr. novi i18n ključ). Ako niza nema — živi build je stariji.

## Nalaz 5.8.2026 13:50

- Živa stranica (`vmbalance.com`, `www`, `cost-buddy-helper.lovable.app` — svi isti
  `x-deployment-id: 1a7dd7c0…`) servira `index-DM1jJWs-.js`; lokalni build daje `index-ChbLkdet.js`.
- HTML se šalje s `cache-control: no-cache` → nije riječ o cacheu.
- Živi paket **nema** i18n ključ `historyExtended`, dodan commitom `082d9723` (2.8.2026 23:07).

**Zaključak: živi web bundle je stariji od 2.8.2026.** Današnje objave nisu legle na produkciju,
iako je dijalog javio uspjeh i sigurnosni gate je propustio.

## Prijedlog za poslije launcha (ne raditi sada)

Ugraditi commit SHA u build preko Vite `define` i izložiti ga na jednom mjestu (meta tag ili
ekran s verzijom). Provjera tada postaje usporedba jednog niza, koju korisnik radi sam.
Ne dirati build konfiguraciju prije launcha.
