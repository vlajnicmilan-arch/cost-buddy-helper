

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
- APK datoteka se ručno uploada u bucket (ili se koristi direkt