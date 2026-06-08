---
name: monetization-model-discussion
description: Otvorena rasprava o novom modelu monetizacije po modulima (opt-in aktivacija, PDF snapshot pri isteku, besplatna baza zauvijek). NIJE implementacija.
type: feature
---

Status: rasprava u tijeku, BEZ implementacije. Postojeći trial sustav ostaje netaknut dok se ne donesu sve odluke ispod.

## Dogovoreno
- Aktivacija svakog naprednog modula = svjestan klik korisnika (opt-in po modulu, ne automatski).
- Postojeći vremenski trial se gasi i uklanja iz UX-a kad se model implementira.
- Po isteku pretplate na modul: podaci tog modula se brišu, ali se prije brisanja generira PDF snapshot koji korisnik može skinuti kad želi.
- Isto pravilo vrijedi i za Krug (detalji otvoreni — vidi pitanje 3).
- Za interne testere/prijatelje: koristi se postojeći `admin_module_grants` mehanizam (per-modul override grants, već implementirano kao Module Access Model v2 PR1).
- Besplatna baza (trenutno zvana "Core") ostaje ZAUVIJEK besplatna. Monetizacija isključivo kroz Projekte / Krug / Business.
- Naziv "Core" je loš za usera — traži se intuitivnije ime (kandidati: "Osnovni", "Novčanik", "Start"; još neodlučeno).

## Otvorena pitanja (blokeri prije bilo kakve implementacije)
1. PDF kao jedini export format — preporuka asistenta: dodati i JSON snapshot (machine-readable za re-import); user još nije odlučio.
2. Re-import nakon ponovne kupnje modula — obećano useru, ali bez JSON-a nije realno izvedivo.
3. Krug specifika — što s podacima koji su dijeljeni među više članova kad jednom članu istekne pristup? Tko dobiva PDF? Briše li se samo njegov udio ili cijeli zapis? Kako se odnosi prema postojećem Krug Deletion Flow-u.
4. Konačno ime za besplatnu bazu.
5. Tri ključne brojke za besplatni model: trošak po free useru/mjesec, ciljani conversion rate, break-even point.
6. AI/scan politika u besplatnoj bazi — trenutno 3/30d core scan kvota (vidi Module Access Model v2). Treba odlučiti je li to dovoljno restriktivno za novi model.
7. Krug monetizacija — zasebno pitanje od ostalih modula (per-user? per-Krug? tko plaća kad ima više članova?).
8. EU SaaS monetizacija (Paddle vs Stripe+OSS) — već postoji `mem://features/eu-saas-monetization-decision`, čeka računovođu. Povezano s ovim modelom.
9. Komunikacija prema postojećim Pro/Business korisnicima kad se trial sustav ukine.

## Sljedeći korak
Kratak dokument koji odgovara na 9 pitanja iznad PRIJE bilo kakve tehničke specifikacije. Bez tog dokumenta ne ulaziti u kod.

## Povezane memorije
- `mem://features/module-access-model-v2` — postojeća osnova (Projects RLS read-only, admin_module_grants, core scan kvota)
- `mem://features/admin-module-access` — admin UI za override grants
- `mem://business/subscription-and-monetization-model` — trenutni Free/Pro/Business model koji se mijenja
- `mem://features/eu-saas-monetization-decision` — Paddle vs Stripe odluka
- `mem://features/krug-deletion-flow` — referenca za pitanje 3
- `mem://features/account-deletion-gdpr` — referenca za PDF snapshot + brisanje obrazac
