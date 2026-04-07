

## Problem

Biometrijski plugin (`@aparajita/capacitor-biometric-auth`) **nikada nije dodan u projekt**. Kod u `AppLockContext.tsx` pokušava koristiti `window.BiometricAuth` koji ne postoji, pa se opcija za biometriju nikad ne prikazuje u postavkama.

Također, PIN UI prikazuje 6 točkica, ali auto-submit se trigerira na 4 znamenke — korisnik nikad ne stigne do 5. ili 6.

---

## Plan promjena

### 1. Instalirati biometrijski plugin

Dodati `@aparajita/capacitor-biometric-auth` u `package.json` i koristiti ga ispravno kao ES modul import umjesto `window` pristupa.

### 2. Popraviti `AppLockContext.tsx` — biometrija

Zamijeniti nestandardni `(window as any).BiometricAuth` pristup s ispravnim importom:

```typescript
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
```

Koristiti `BiometricAuth.checkBiometry()` i `BiometricAuth.authenticate()` direktno.

### 3. Standardizirati PIN na 4 znamenke

**`SetPinDialog.tsx`:**
- Promijeniti prikaz točkica s 6 na 4
- Ograničiti unos na max 4 znamenke
- Ukloniti auto-submit na `length === 6`

**`LockScreen.tsx`:**
- Promijeniti prikaz točkica s 6 na 4
- Ograničiti unos na max 4 znamenke
- Ukloniti auto-submit na `length === 6`

---

## Datoteke za izmjenu

| Datoteka | Promjena |
|---|---|
| `package.json` | Dodati `@aparajita/capacitor-biometric-auth` |
| `src/contexts/AppLockContext.tsx` | Ispraviti biometrijski import i pozive |
| `src/components/SetPinDialog.tsx` | PIN ograničiti na 4 znamenke |
| `src/components/LockScreen.tsx` | PIN ograničiti na 4 znamenke |

---

## Napomena

Nakon ovih promjena, morat ćeš na računalu napraviti:
1. `npm install`
2. `npm run build`
3. `npx cap sync android`
4. Novi APK build u Android Studiju

Tek tada će biometrija biti dostupna na mobitelu.

