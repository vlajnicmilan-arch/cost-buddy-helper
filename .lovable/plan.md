

# Popravak APK preuzimanja na Install stranici

## Problem
Gumb "Preuzmi APK" na `/install` stranici koristi krivi URL:
```
https://cost-buddy-helper.lovable.app/vm-balance.apk
```
Ta datoteka ne postoji na tom serveru. Landing stranica koristi ispravan URL iz Supabase Storagea.

## Popravak

**Datoteka:** `src/pages/Install.tsx`

Zamijeniti hardkodirani URL s dinamičkim Supabase Storage URL-om (isti pristup kao u Landing.tsx):

```tsx
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const apkUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/vm-balance.apk`;
```

Zatim na liniji 323 zamijeniti:
```tsx
onClick={() => window.open('https://cost-buddy-helper.lovable.app/vm-balance.apk', '_blank')}
```
s:
```tsx
onClick={() => window.open(apkUrl, '_blank')}
```

Jedna linija promjene + jedna linija za varijablu. Nema drugih promjena.

