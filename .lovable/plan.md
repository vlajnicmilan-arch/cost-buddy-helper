

## Plan: Ispraviti ime APK datoteke u kodu

### Problem
APK datoteka je uspješno uploadana u `public-assets` bucket, ali pod imenom **`app-debug.apk`** (12.8 MB). Kod u `Landing.tsx` trenutno traži **`vm-balance.apk`**, pa download link neće raditi.

### Rješenje
Ažurirati URL u `src/pages/Landing.tsx` da koristi ispravno ime datoteke `app-debug.apk`.

### Promjena

| Datoteka | Promjena |
|---|---|
| `src/pages/Landing.tsx` | Promijeniti `vm-balance.apk` → `app-debug.apk` u APK URL-u |

Jedna linija koda za promijeniti.

