

## Plan: Dodaj opciju "Podijeli aplikaciju" u Postavke

### Sto se radi

Dodaje se nova sekcija u SettingsDialog s gumbom "Podijeli aplikaciju" koji koristi postojeci `useNativeShare` hook za dijeljenje linka na vmbalance.com s referral parametrom (user ID). Kada primatelj otvori link i registrira se, automatski se preusmjerava na Paywall stranicu za odabir pretplate.

### Promjene

**1. `src/components/SettingsDialog.tsx`**
- Dodati novu sekciju "Podijeli" (izmedju Privacy i App Info sekcija, oko linije 1439)
- Gumb "Podijeli aplikaciju" koji poziva `useNativeShare` s linkom `https://vmbalance.com?ref={userId}`
- Tekst: "Pozovi prijatelje na V&M Balance"
- Ikona: Share2 (vec importana)

**2. `src/hooks/useNativeShare.ts`**
- Dodati novu metodu `shareApp(userId: string)` koja dijeli:
  - title: "V&M Balance"
  - text: "Isprobaj V&M Balance - aplikaciju za pracenje financija!"
  - url: `https://vmbalance.com?ref={userId}`

**3. `src/pages/Landing.tsx`**
- Citati `ref` query parametar iz URL-a
- Spremiti ga u `localStorage` kao `referrer_id` za kasniju upotrebu

**4. `src/pages/Auth.tsx`** (ili post-signup logika)
- Nakon uspjesne registracije, provjeriti `localStorage` za `referrer_id`
- Ako postoji, pozvati `track-referral` edge funkciju
- Preusmjeriti novog korisnika na `/paywall` umjesto standardnog onboarding toka (samo ako dolazi preko referral linka)

### Tok korisnika

```text
Korisnik A -> Postavke -> "Podijeli aplikaciju"
  -> Native share dialog s linkom vmbalance.com?ref=USER_ID
  
Korisnik B otvori link -> Landing page (ref se spremi)
  -> Registracija -> track-referral -> Paywall (odabir pretplate)
```

