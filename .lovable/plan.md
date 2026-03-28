

# Plan: Popravak Capacitor nativnog builda

## Problem
Capacitor WebView učitava remote URL koji servira PWA manifest → Service Worker se registrira → aplikacija se ponaša kao PWA umjesto native app. Naziv "Trošak" dolazi iz starog PWA cachea na uređaju.

## Rješenje

### 1. Onemogućiti Service Worker u Capacitor okruženju

**Datoteka: `src/main.tsx`**

Dodati guard koji detektira Capacitor native platform i odregistrira sve postojeće Service Workere te sprječava buduću registraciju. Ovo osigurava da unutar nativne ljuske nikada ne dođe do PWA instalacije.

```typescript
// Deregister SW in native Capacitor builds
if (window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker?.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
}
```

Također dodati istu provjeru u iframe/preview kontekstu kako je preporučeno.

### 2. Upute za produkcijski build (bez remote URL-a)

Korisnik treba pri izradi produkcijskog APK-a:
1. U `capacitor.config.ts` — zakomentirati/ukloniti `server` blok (URL i cleartext)
2. Pokrenuti `npm run build` → `npx cap sync` → build u Android Studiju
3. Bez `server` bloka, Capacitor učitava lokalne datoteke iz `dist/` i nema PWA problema

### 3. Obrisati stari PWA cache na uređaju

Uputa korisniku: na telefonu obrisati podatke preglednika/aplikacije ili deinstalirati staru "Trošak" PWA instalaciju.

## Zahvaćene datoteke

| Datoteka | Promjena |
|---|---|
| `src/main.tsx` | Dodati SW deregistraciju za Capacitor native i iframe/preview |
| `capacitor.config.ts` | Dodati komentar koji objašnjava kad ukloniti server blok |

