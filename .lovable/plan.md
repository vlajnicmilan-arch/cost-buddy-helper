

## Plan: Referral link vodi na preuzimanje APK-a

### Trenutno stanje
Dijeljeni link (`vmbalance.com?ref=userId`) vodi na Landing stranicu koja nema opciju preuzimanja APK datoteke. Korisnik samo vidi web stranicu s opcijom prijave.

### Što se mijenja

**1. Landing stranica — APK download sekcija**
- Kada Landing detektira `ref` parametar u URL-u, prikazuje istaknutu sekciju za preuzimanje Android aplikacije
- Gumb "Preuzmi V&M Balance" koji pokreće preuzimanje APK datoteke
- APK datoteka se hosta u backend storage-u (bucket `public-assets`) ili na vanjskom linku

**2. APK hosting**
- Kreirati storage bucket `public-assets` s javnim pristupom
- APK datoteka se ručno uploada u bucket (ili se koristi direktan URL koji vi definirate)
- Alternativno: koristiti Google Drive link ili drugi hosting za APK

**3. Tok nakon instalacije**
- Korisnik preuzme i instalira APK
- Otvori aplikaciju → dolazi na Auth stranicu
- Referral ID se ne prenosi automatski u nativnu aplikaciju (jer APK ne čuva URL parametre)
- **Rješenje**: Na Landing stranici, uz APK download, prikazati i referral kod koji korisnik unosi prilikom registracije, ILI se referral sprema na server po IP/device fingerprint

### Pitanje za odluku
APK preuzimanje ne prenosi `ref` parametar u nativnu aplikaciju. Dvije opcije:
1. **Referral kod** — prikazati kod na stranici koji korisnik unese pri registraciji
2. **Deep link** — koristiti custom URL scheme (`vmbalance://ref=userId`) koji nativna app čita pri pokretanju

### Predložene promjene

| Datoteka | Promjena |
|---|---|
| `src/pages/Landing.tsx` | Dodati APK download sekciju kada je `ref` prisutan |
| `supabase` storage | Kreirati `public-assets` bucket za APK hosting |
| `src/pages/Auth.tsx` | Dodati polje za unos referral koda (ako se ide s opcijom 1) |

