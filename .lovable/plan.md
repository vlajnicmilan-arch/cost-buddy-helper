## Cilj

Spremiti trajne `mem://` memorije koje će svaki budući AI (uključujući mene u novoj sesiji) automatski učitati, tako da nakon reverta na verziju prije 2. svibnja 23:33 ne dođe do ponavljanja istih grešaka ili prijedloga.

## Što ću spremiti

### 1. `mem://constraints/business-profile-switcher-in-header`
Tip: **constraint** (nikad ne predlagati ponovno)

Sadržaj:
- 2. svibnja 2026 navečer (commit serija od 22:17–22:53) dodan je `BusinessProfileSwitcher` u `HomeHeader.tsx` ispod pozdrava ("Bok, Milan").
- Korisnik to NE želi — switcher u headeru je vizualno preopterećenje i zbunjuje.
- **Zabranjeno:** ponovno dodavati switcher konteksta u `HomeHeader` ili bilo koji globalni header.
- **Pravilo:** prebacivanje između Osobno / Business profila ide isključivo preko `WalletViewModeChips` na dashboardu.

### 2. `mem://features/business-mode-strategic-direction`
Tip: **feature** (strateški kontekst za buduće odluke)

Sadržaj:
- Aplikacija **neće** biti službena hrvatska poslovna aplikacija (bez fiskalizacije, eRačuna, JOPPD, izvoza za knjigovođu).
- Zbog toga je `business_profile` trenutno samo "kontekstualni filter" (OIB + naziv + ID za izolaciju transakcija) — bez prave dodane vrijednosti naspram projekta s timom.
- **Otvoreno pitanje (ne odlučeno):** ukinuti business mode u korist projekata, ili zadržati kao tihi filter.
- Prije bilo kakvog refactora business modea — pitati korisnika za potvrdu smjera.

### 3. Update `mem://index.md`
Dodati obje nove memorije u Memories sekciju, sačuvati sav postojeći sadržaj.

## Redoslijed nakon ovoga

1. Odobri ovaj plan → prelazim u build mode i pišem memorije.
2. Ti otvoriš History i revertaš na poruku **prije** 2. svibnja 22:17.
3. Memorije ostaju (žive izvan koda) — sljedeći AI odmah zna kontekst.

## Tehničke napomene

- Memorije se pišu kao `.md` fajlovi u `mem://` namespace s YAML frontmatter (`type`, `name`, `description`).
- `mem://index.md` se prepisuje cijeli — uključit ću sav postojeći sadržaj + 2 nove linije.
- Bez izmjena koda u ovom koraku.
