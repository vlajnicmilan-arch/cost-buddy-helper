# Plan: Odvajanje landing web stranice od React aplikacije

## Cilj
Landing/marketing stranice (`/`, `/projekti`, pravne stranice) i autenticirana React aplikacija (`/app`, `/home`, `/dashboard`...) postaju dva odvojena projekta. Web stranica učitava trenutno, aplikacija builda samo svoj kod, a korisnik ne osjeća prekid pri prijavi.

## Trenutno stanje
- Jedan Vite/React projekt.
- Landing stranice postoje unutar SPA-e i peku se u HTML kroz `bakeLandingPlugin.mjs`.
- Custom domain `vmbalance.com` i `www.vmbalance.com` vodi na Lovable app.
- Sva autentikacija ide preko Supabase unutar istog codebasea.

## Ciljna arhitektura
```text
vmbalance.com      →  Astro statički sajt (landing, marketing, pravne stranice)
www.vmbalance.com  →  isti Astro sajt
app.vmbalance.com  →  postojeća React/Vite aplikacija na Lovable hostingu
```

---

## Korak 1: Priprema i inventura
1. Otvori novi repozitorij/projekt za landing.
2. Napravi popis svega što landing koristi iz trenutnog projekta:
   - `src/pages/CentarLanding.body*.html` (HR, EN, DE)
   - `src/pages/ProjektiLanding.body.html`
   - `public/centar/img/*`, `public/centar-logo.png`
   - `src/assets/landing/*` (slike za `/projekti`)
   - `src/lib/landingTelemetry.ts`, `src/lib/fastLanding.js`, `src/lib/landingRenderMode.ts`
   - `src/i18n` ključevi koji se koriste samo na landingu
   - `funnelTracking.ts`, CTA događaji, `session_id`
   - Stilovi: Tailwind klase koje landing koristi
3. Odaberi landing stack: preporuka **Astro** (statički build, brz, dobar SEO, može ugraditi odlomke Reacta ako zatreba).

## Korak 2: Izgradi Astro landing projekt
1. Inicijaliziraj Astro projekt (`npm create astro@latest`).
2. Prebaci HTML body-je iz `CentarLanding.body*.html` i `ProjektiLanding.body.html` u Astro stranice.
3. Prebaci slike u `public/` ili `src/assets/` novog projekta.
4. Postavi i18n u Astro-u (HR default, EN, DE) koristeći iste ključeve gdje je moguće.
5. Rekreiraj `landingTelemetry.ts` logiku u Astro-u — oznaka `render: 'baked' | 'spa'` i `layout` događaji moraju ostati kompatibilni s postojećom analitikom.
6. Rekreiraj CTA-ove kao obične `<a href="https://app.vmbalance.com/auth?mode=signup">`.
7. Prebaci SEO meta tagove, JSON-LD, canonical, favicon, sitemap.

## Korak 3: Postavi domene
1. U Lovable postavi da `app.vmbalance.com` bude custom domain za postojeći projekt.
   - Lovable hosting će tada servirati React aplikaciju na `app.vmbalance.com`.
2. Na DNS provideru postavi:
   - `vmbalance.com` → A/AAAA ili CNAME prema Astro hostu (npr. Vercel, Netlify, Cloudflare Pages)
   - `www.vmbalance.com` → CNAME prema Astro hostu
   - `app.vmbalance.com` → CNAME prema Lovable-u (Lovable će dati upute prilikom dodavanja domene)
3. Pričekaj propagaciju i provjeri certifikate.

## Korak 4: Cross-domain autentikacija
1. U Supabase auth settings postavi dodatni redirect URL: `https://app.vmbalance.com/auth/callback`.
2. Na landing CTA-ovima koristi `https://app.vmbalance.com/auth?mode=signup` i `https://app.vmbalance.com/auth?mode=login`.
3. Provjeri da Supabase session cookie/localStorage funkcionira na `app.vmbalance.com` nakon redirecta.
4. Ako koristiš Google/Apple OAuth, postavi `redirect_uri` na `https://app.vmbalance.com/auth/callback`.
5. Testiraj:
   - signup → email confirmation → login
   - Google login
   - deep linkovi s pozivnica (`/join-project/...`, `/join-budget/...`)

## Korak 5: Ukloni landing iz React aplikacije
Nakon što landing živi na `vmbalance.com` i `app.vmbalance.com` radi:
1. Ukloni rute iz `src/App.tsx`:
   - `/`
   - `/landing`
   - `/projekti`
   - pravne stranice ako prelaze na Astro (ili ih ostavi u appu ako moraju biti dostupne nakon prijave)
2. Ukloni `bakeLandingPlugin.mjs` i `bakeLandingPlugin.d.mts` iz Vite configa.
3. Ukloni `src/lib/fastLanding.js`, `src/lib/landingRenderMode.ts`, `src/lib/landingTelemetry.ts`.
4. Ukloni `src/pages/CentarLanding*.tsx`, `src/pages/ProjektiLanding.tsx` i pripadajuće `.body.html` datoteke.
5. Ukloni landing slike iz `public/centar/` i `src/assets/landing/` koje više nisu potrebne u appu.
6. Ukloni landing-specific chunkove iz `vite.config.ts` `manualChunks` ako postoje.
7. Ukloni testove vezane uz landing (`bakedBootResilience.test.ts`, `fastLandingCondition.test.ts`, `centarLightboxState.test.ts` ili ih prebaci u Astro projekt).
8. Osiguraj da `public/sw.js` i dalje radi self-destruct.
9. Ažuriraj `publicRoutes.ts` — landing rute više nisu potrebne.

## Korak 6: Optimiziraj preostalu React aplikaciju
1. Provjeri lazy loading svih ruta u `App.tsx`.
2. Pregledaj `manualChunks` u `vite.config.ts` — landing više ne vuče jspdf/recharts/xlsx na prvi ekran.
3. Provjeri da `index.html` ima ispravan title/description (više nije landing).
4. Pokreni `bunx vite build` i analiziraj bundle.

## Korak 7: Redirecti i fallbackovi
1. Na Astro sajtu postavi redirecte:
   - `vmbalance.com/auth` → `app.vmbalance.com/auth`
   - `vmbalance.com/app` → `app.vmbalance.com/app`
   - `vmbalance.com/home` → `app.vmbalance.com/home`
   - `vmbalance.com/join-project/*` → `app.vmbalance.com/join-project/*`
   - `vmbalance.com/join-budget/*` → `app.vmbalance.com/join-budget/*`
2. U React appu osiguraj da `/` redirecta na `/app` ili `/auth` ako korisnik nije prijavljen.
3. Postavi 404 stranicu na Astro sajtu.

## Korak 8: Testiranje prije objave
1. **Lighthouse** na `vmbalance.com` i `app.vmbalance.com`.
2. **Build** React aplikacije bez grešaka.
3. **E2E** osnovni tokovi: signup, login, dodavanje troška, pozivnica na projekt.
4. **Web deploy verification** za React app: usporedi hashove Vite assetsa na `app.vmbalance.com` s lokalnim buildom.
5. **SEO**: provjeri canonical, sitemap, robots.txt, JSON-LD na Astro sajtu.
6. **PWA/native**: provjeri da Capacitor APK i dalje učitava `https://vmbalance.com/app` (ili `app.vmbalance.com/app` ako se to mijenja — to zahtijeva posebnu pažnju i verziju APK-a).

## Korak 9: Objava
1. Objavi Astro sajt na produkciju.
2. Objavi Lovable aplikaciju na `app.vmbalance.com`.
3. Prebaci DNS `vmbalance.com`/`www` na Astro host tek nakon što su obje strane live i testirane.
4. Monitiraj 404-e, Core Web Vitals i konverzije 24–48h.

---

## Važni rizici i kako ih izbjeći
- **Native APK**: `capacitor.config.ts` trenutno učitava `https://vmbalance.com/app`. Ako se landing odvoji, APK mora nastaviti učitavati aplikaciju. Rješenje: `app.vmbalance.com/app` kao `server.url`, ali to zahtijeva novi APK build i verziju. Do tada možeš zadržati `/app` rutu na `vmbalance.com` koja redirecta ili servira aplikaciju.
- **Auth sesija između domena**: Supabase session u localStorage je scoped po originu. `vmbalance.com` ne vidi session od `app.vmbalance.com`. Rješenje: prijava se uvijek događa na `app.vmbalance.com`.
- **Pozivnice i deep linkovi**: linkovi poput `vmbalance.com/join-project/xyz` moraju raditi. Rješenje: Astro redirecta te putanje na `app.vmbalance.com/join-project/xyz`.
- **SEO gubitak**: ako se Astro ne postavi s canonical i redirectima, može doći do dupliciranog sadržaja. Rješenje: postavi canonical na svaku stranicu i 301 redirecte.

---

## Procjena truda
- **Astro setup + prebacivanje landinga**: 1–2 dana
- **Domain/DNS + Lovable config**: nekoliko sati (ovisno o DNS propagaciji)
- **Auth cross-domain + OAuth callback**: 1 dan
- **Uklanjanje landinga iz React appa + cleanup**: 1 dan
- **Testiranje i objava**: 1–2 dana

**Ukupno**: 4–6 dana koncentriranog rada, ovisno o tome koliko sadržaja landinga treba prebaciti i koliko custom komponenti postoji.

---

## Kriteriji uspjeha
- `vmbalance.com` učitava se za manje od 1.5s na mobilnoj 3G simulaciji.
- `app.vmbalance.com` bundle je manji za landing chunkove.
- Prijava, signup, Google OAuth i pozivnice rade bez grešaka.
- Nema 404 na `/auth`, `/app`, `/join-project/*`, `/join-budget/*`.
- Web deploy verification prolazi za React app.
