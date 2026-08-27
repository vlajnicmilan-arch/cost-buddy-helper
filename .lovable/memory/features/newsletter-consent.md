---
name: Newsletter privola i pravila slanja
description: newsletter_consents tablica; tvrdo pravilo — nijedan newsletter mail bez one-click odjave koja upisuje revoked_at
type: feature
---

# Newsletter privola

- Tablica `public.newsletter_consents` (migracija 20260827): user_id, email, doslovni `consent_text`, `locale`, `source`, `consented_at`, `revoked_at`.
- Registracija (`src/pages/Auth.tsx`) ima zasebnu, PRAZNU, NEOBAVEZNU kvačicu — nikad pred-označena (GDPR). Bez oznake NE upisuje se redak.
- Doslovni tekst privole se sprema (dokaz), ne samo boolean.
- Ako registracija zahtijeva potvrdu maila, namjera se čuva u sessionStorage i flusha pri prvoj sesiji (`flushPendingNewsletterConsent`).
- Odjava = upis `revoked_at`. Redak se NIKAD ne briše.

## TVRDO PRAVILO ZA BUDUĆE SLANJE (uvjet valjanosti privola)

"Nijedan newsletter mail ne smije se poslati bez poveznice za odjavu u jednom kliku, koja upisuje revoked_at u newsletter_consents. Privola se mora moći povući jednako lako kao što je dana. Adrese koje nisu prošle kroz newsletter_consents ne smiju se koristiti."

- NEMA prekidača u postavkama (odluka vlasnika).
- Ovaj modul NE šalje maileve — samo prikuplja i bilježi privolu.
