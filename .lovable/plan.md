

# Plan: Popravak provjere ažuriranja na nativnoj aplikaciji

## Problem

Dva problema sprečavaju rad "Provjeri ažuriranja" na nativnoj app:

1. **`capacitor.config.ts` nema `server` blok** — aplikacija učitava lokalni `dist` folder umjesto produkcijskog URL-a. Bez Live Sync-a, `version.json` se čita iz bundlea i uvijek vraća istu verziju.

2. **`fetchLatestVersion` koristi relativni path** (`/version.json`) — čak i s Live Sync-om, trebamo osigurati da se dohvaća s produkcijskog servera.

## Rješenje

### 1. Vratiti Live Sync u `capacitor.config.ts`

Dodati `server` blok koji usmjerava nativnu app na produkcijski URL:

```typescript
const config: CapacitorConfig = {
  appId: 'app.lovable.costbuddy',
  appName: 'V&M Balance',
  webDir: 'dist',
  server: {
    url: 'https://cost-buddy-helper.lovable.app?forceHideBadge=true',
    cleartext: true,
  },
};
```

Ovo osigurava da nativna app uvijek učitava najnoviju verziju s produkcije i da `/version.json` dolazi s pravog servera.

### 2. Rebuild APK

Nakon ove promjene, trebat će:
- Publishati promjenu
- Na računalu: `git pull` → `npm run build` → `npx cap sync android` → buildati novi APK

**Napomena**: Ovo je jednokratna promjena. Nakon što Live Sync radi, sve buduće promjene (uključujući "Provjeri ažuriranja") će raditi automatski bez ponovnog builda APK-a.

