## Problem

Na laptopu (web) sve radi. Na mobitelu, kada user u **APK aplikaciji** klikne "Prijava s Google":

1. Otvara se Google OAuth (u Custom Tab / browseru).
2. Login uspijeva, Google preusmjerava na `https://vmbalance.com/app#access_token=...`.
3. Android **ne zna** da je ta URL "u vlasništvu" naše instalirane APK aplikacije, pa je otvara u browseru ili u već instaliranoj PWA verziji.
4. Native APK ostaje na ekranu prijave — session se nikad ne preda natrag u WebView APK-a.

## Root Cause

Dva problema koja se kombiniraju:

**A. Auth.tsx ne razlikuje native od weba.** Google i Apple gumbi uvijek pozivaju `lovable.auth.signInWithOAuth(...)` s `redirect_uri: window.location.origin + '/app'`. Postoji `useNativeOAuth` hook, ali se nigdje ne koristi.

**B. Nema Android App Linksa za vmbalance.com.** Da bi Android otvorio našu APK na URL-u `https://vmbalance.com/app`, trebamo:
- `assetlinks.json` na `https://vmbalance.com/.well-known/assetlinks.json` koji veže paket `app.lovable.costbuddy` + SHA-256 fingerprint potpisa s domenom.
- `intent-filter` u `AndroidManifest.xml` s `android:autoVerify="true"` za `https://vmbalance.com/*`.

Bez toga sustav uvijek pita "browser ili PWA?" ili automatski bira PWA jer je već "installed handler" za tu domenu.

## Plan

### 1. Hook OAuth gumbe u Auth.tsx na native flow

`src/pages/Auth.tsx` (Google + Apple onClick): ako je `Capacitor.isNativePlatform()`, koristi `useNativeOAuth().signInWithOAuth(provider)` umjesto direktnog `lovable.auth.signInWithOAuth`. Web ostaje nepromijenjen.

### 2. Native OAuth flow koji se vraća u APK

`src/hooks/useNativeOAuth.ts` — ispravna implementacija:
- Pozovi `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: 'app.lovable.costbuddy://oauth-callback', skipBrowserRedirect: true, queryParams: provider==='google' ? { prompt: 'select_account' } : undefined } })` da dobiješ `data.url`.
- Otvori taj URL u **Capacitor Browser** plugin-u (`@capacitor/browser` → `Browser.open({ url, presentationStyle: 'popover' })`).
- Slušaj `App.addListener('appUrlOpen', ...)` i kad URL počinje s `app.lovable.costbuddy://oauth-callback`, izvuci `code`, zatvori browser (`Browser.close()`), pozovi `supabase.auth.exchangeCodeForSession(code)`.
- `useDeepLinks.ts` već preskače OAuth callback URL-ove — proširi guard na custom scheme.

### 3. Registracija custom scheme u AndroidManifest

`android/app/src/main/AndroidManifest.xml` u glavni `MainActivity` dodaj intent-filter:
```
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="app.lovable.costbuddy"/>
</intent-filter>
```

### 4. Supabase redirect URL whitelist

U Lovable Cloud → Auth → URL Configuration dodaj `app.lovable.costbuddy://oauth-callback` u **Redirect URLs**. Bez toga Supabase odbija callback. (Korisniku ću dati direktan link kad pređemo u build mode.)

### 5. (Opcionalno, kasnije) Android App Links za vmbalance.com

Da bi i postojeći `https://vmbalance.com/app` linkovi (push notifikacije, dijeljeni linkovi) otvarali APK umjesto PWA-e, kasnije ćemo dodati:
- `public/.well-known/assetlinks.json` s package name + SHA-256 release potpisa.
- `intent-filter` s `android:autoVerify="true"` za `https://vmbalance.com`.

Ovo nije nužno za samu OAuth prijavu jer custom scheme rješenje (#2-#4) ne ovisi o domeni.

## Files to change

- `src/pages/Auth.tsx` — Google/Apple gumbi delegiraju na `useNativeOAuth` na nativu.
- `src/hooks/useNativeOAuth.ts` — prava implementacija s `@capacitor/browser`, deep link listenerom i `exchangeCodeForSession`.
- `src/hooks/useDeepLinks.ts` — proširi OAuth-callback guard na custom scheme.
- `android/app/src/main/AndroidManifest.xml` — intent-filter za `app.lovable.costbuddy://` scheme.
- (možda) `package.json` — dodati `@capacitor/browser` ako nije već instaliran.

## After approval

Nakon implementacije korisnik mora:
1. Klikni **Publish** (web side promjene).
2. Otvori Lovable Cloud Auth postavke i dodaj `app.lovable.costbuddy://oauth-callback` u Redirect URLs (dat ću link).
3. Lokalno: `git pull` → `npm install --legacy-peer-deps` → `npx cap sync android` → rebuild APK.
4. Instaliraj novi APK i testiraj Google login.
