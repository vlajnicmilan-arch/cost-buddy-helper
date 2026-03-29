

## Plan: Zamjena loga na stari

Korisnik je uploadao sliku starog loga (`user-uploads://logo.png`). Treba zamijeniti trenutni `src/assets/logo.png` s ovom slikom.

### Koraci

1. **Kopiraj uploadani logo** u `src/assets/logo.png` (prepiše postojeći)
2. **Ažuriraj favicon** — kopiraj isti logo u `public/favicon.png` i ažuriraj `index.html` da koristi novi favicon
3. **Ažuriraj Apple touch icon** u `index.html` ako postoji

Nikakve promjene u komponentama nisu potrebne jer sve već importaju `@/assets/logo.png`.

