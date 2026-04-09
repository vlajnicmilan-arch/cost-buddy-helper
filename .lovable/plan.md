

# Plan: OAuth povratak u nativnu aplikaciju umjesto PWA

## Problem

Kad korisnik u Capacitor nativnoj aplikaciji klikne "Nastavi s Google računom", OAuth flow otvara vanjski preglednik. Nakon autentifikacije, redirect ide na `https://vmbalance.com` — ali umjesto da se vrati u nativnu WebView shell, otvara PWA ili web stranicu u pregledniku.

## Uzrok

1. `redirect_uri` je postavljen na `window.location.origin` koji u Live Sync modu (`server.url: https://vmbalance.com`) resolva na `https://vmbalance.com`
2. Nema konfiguriranog Android App Linka / iOS Universal Linka koji bi presreo taj URL i otvorio nativnu aplikaciju
3. Deep link handler (`useDeepLinks.ts`) sluša `appUrlOpen` event, ali OAuth redirect ne koristi custom URL scheme niti verified domain link

## Rješenje

### Korak 1: Konfigurirati Android App Links i iOS Universal Links

**Android** — dodati `assetlinks.json` na `vmbalance.com/.well-known/` i konfigurirati intent filter u `AndroidManifest.xml` da presretne `https://vmbalance.com/*` URL-ove i usmjeri ih natrag u nativnu aplikaciju.

**iOS** — dodati `apple-app-site-association` na `vmbalance.com/.well-known/` i konfigurirati Associated Domains u Xcode projektu.

> Ovo zahtijeva hosting konfiguraciju na `vmbalance.com` — treba dodati verification JSON datoteke.

### Korak 2: Dodati OAuth callback handling u deep link handler

Proširiti `useDeepLinks.ts` da prepozna OAuth callback URL-ove (koji sadrže `access_token` ili `code` parametar) i proslijedi token Supabase klijentu za uspostavu sesije.

### Korak 3: Alternativa — koristiti In-App Browser

Umjesto vanjskog preglednika, na nativnoj platformi koristiti `@capacitor/browser` plugin koji otvara OAuth stranicu unutar aplikacije. Nakon redirecta, presresti URL u `browserFinished` / URL change eventu i zatvoriti in-app browser.

Ovo je **jednostavniji pristup** jer ne zahtijeva App Links konfiguraciju na serveru.

### Korak 4: Implementirati nativni OAuth flow u Auth.tsx

Dodati detekciju `Capacitor.isNativePlatform()` u Google/Apple sign-in buttone. Ako je nativna platforma:
- Otvoriti OAuth URL putem `Browser.open()` umjesto `window.location` redirecta
- Slušati `appUrlOpen` event za callback
- Parsirati tokene iz callback URL-a
- Postaviti Supabase sesiju putem `supabase.auth.setSession()`

## Datoteke za promjenu

| Datoteka | Promjena |
|---|---|
| `src/pages/Auth.tsx` | Nativni OAuth flow s `@capacitor/browser` |
| `src/hooks/useDeepLinks.ts` | Dodati OAuth callback pattern matching |
| `capacitor.config.ts` | (možda) dodati `appUrlOpen` handling config |
| `public/.well-known/assetlinks.json` | Android App Links verification (ako se ide taj put) |

## Preporuka

**Korak 3 (In-App Browser)** je najpraktičniji jer radi odmah bez serverske konfiguracije. App Links se mogu dodati naknadno za još bolji UX.

## Ograničenje

`src/integrations/lovable/index.ts` je auto-generirani file koji se ne smije mijenjati. Trebat će "zaobići" `lovable.auth.signInWithOAuth` na nativnoj platformi — umjesto toga, ručno konstruirati OAuth URL i koristiti Capacitor Browser plugin za otvaranje, pa tokene ručno proslijediti `supabase.auth.setSession()`.

