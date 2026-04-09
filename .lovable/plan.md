

# Plan: Lovable značajke — korak po korak

## Trenutno stanje

| Značajka | Status |
|----------|--------|
| Sigurnosni scan | 1 aktivni warning (family_invitations email) |
| Lovable badge | ✅ Već sakriven |
| Email domena (vmbalance.com) | ⚠️ DNS verifikacija u tijeku (status: initiated) |
| Auth email predlošci | ✅ Već scaffoldirani |
| Transakcijski emailovi | ❌ Nisu postavljeni |
| Analitika | ❌ Nije korištena |

## Koraci implementacije

### Korak 1: Popraviti sigurnosni nalaz — family_invitations email exposure

Trenutno svi članovi obiteljske grupe mogu vidjeti email adrese pozivnica. Treba ograničiti SELECT politiku tako da email vide samo vlasnik grupe i pošiljatelj pozivnice.

- Kreirati migraciju koja ažurira RLS politiku na `family_invitations`
- SELECT pristup emailu ograničiti na `invited_by = auth.uid()` ili vlasnika grupe (koristeći `is_family_owner()`)

### Korak 2: Brendirati auth email predloške

Predlošci već postoje ali koriste zadane stilove. Treba ih uskladiti s V&M Balance brendom:

- Primarna boja: teal (HSL 172 66% 40%)
- Font: Inter
- Dodati logo iz `public-assets` bucketa ako postoji
- Prilagoditi tekst na hrvatski jezik
- Deployati ažuriranu `auth-email-hook` funkciju

### Korak 3: Postaviti transakcijske emailove

Omogućiti slanje emailova iz aplikacije (potvrde transakcija, budget alerte, podsjetnici):

- Koristiti `scaffold_transactional_email` alat
- Kreirati predloške za ključne notifikacije
- Integrirati s postojećim notification sustavom

### Korak 4: Provjeriti DNS status i aktivirati emailove

- Provjeriti je li DNS verifikacija za vmbalance.com završena
- Ako nije, uputiti korisnika na potrebne DNS zapise
- Nakon verifikacije, emailovi se automatski aktiviraju

## Napomena

Analitika se može pregledati odmah u Lovable sučelju (Cloud → Analytics) bez ikakvih promjena u kodu. Samo treba otvoriti taj pregled.

