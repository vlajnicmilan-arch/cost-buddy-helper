Potvrdio sam iz stvarnih dijagnostičkih logova da novi APK sada učitava dobar logo i app verziju, ali Google OAuth callback ne ulazi natrag u Capacitor aplikaciju.

Ključni nalaz:
- APK starta na `https://vmbalance.com/app?forceHideBadge=true` s `isCapacitor:true`.
- Nakon Google odabira račun se vraća na `https://vmbalance.com/native-oauth/callback...`, ali taj callback se izvršava kao običan web/PWA (`isCapacitor:false`), ne u APK-u.
- Callback dolazi s tokenima u URL hash-u (`#access_token=...&refresh_token=...`), a trenutačni native handler očekuje uglavnom `code` i zato ne postavlja sesiju u WebView.
- Zbog toga aplikacija ostane na login ekranu i prikaže “Prijava preko Googlea nije usp...”.

Plan popravka:

1. Učvrstiti native OAuth callback obradu
   - Ažurirati `src/hooks/useNativeOAuth.ts` da podržava oba moguća OAuth rezultata:
     - PKCE `code` callback preko `exchangeCodeForSession(code)`
     - implicit token callback preko `access_token` + `refresh_token` i `supabase.auth.setSession(...)`
   - Nakon uspješnog postavljanja sesije zatvoriti Capacitor Browser i vratiti korisnika u aplikaciju bez ostavljanja login ekrana.
   - Dodati dijagnostičke evente za početak OAuth-a, primljen deep link, tip callbacka (`code` ili `tokens`) i grešku, bez zapisivanja stvarnih tokena.

2. Učiniti HTTPS bridge robusnijim za Android
   - Ažurirati `src/pages/NativeOAuthCallback.tsx` tako da pri povratku s Googlea eksplicitno šalje i `search` i `hash` natrag u app scheme/intent.
   - Dodati jasniji fallback gumb “Otvori aplikaciju” za slučaj da Android automatski ne prebaci iz browsera u APK.
   - Ne spremati tokene u logove i ne prikazivati ih u UI-u.

3. Provjeriti Android deep link konfiguraciju
   - Pregledati i po potrebi korigirati `AndroidManifest.xml` intent filtere za `app.lovable.costbuddy://auth/callback`.
   - Zadržati eksplicitni package intent kako bi se izbjeglo otvaranje PWA/web verzije.

4. Ukloniti/ublažiti uzrok “bad_oauth_state” slučaja
   - Trenutni logovi pokazuju i povratak na `/ ?error=bad_oauth_state` u browseru.
   - U native toku neću se oslanjati na browser storage/state gdje god možemo izbjeći problem; callback s tokenima će se direktno prenijeti u APK i tamo postaviti sesiju.

5. Lokalizacija i postojeći standardi
   - Sve nove vidljive poruke idu kroz postojeće i18n ključeve u HR/EN/DE.
   - Ne dirati auto-generirane backend client/type datoteke.
   - Ne uvoditi novu auth arhitekturu; popravak ostaje u postojećem native OAuth toku.

Nakon odobrenja ću napraviti ove izmjene u kodu. Nakon toga trebaš napraviti novi build/APK istim postupkom kao sada. Očekivani rezultat: nakon odabira Google računa Android se vraća u instalirani APK i korisnik je prijavljen, bez odlaska u PWA/web i bez poruke neuspješne prijave.