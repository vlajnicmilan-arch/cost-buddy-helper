

## Plan: Popravak Install stranice — prikaz samo relevantne platforme s jasnim uputama

### Problem
Kad korisnik klikne "Instaliraj aplikaciju" na landing pageu, otvori se /install stranica koja prikazuje:
- Verziju aplikacije i pomoćne upute (tabovi)
- Kartice za SVE platforme (iOS, Android, Windows, macOS) — zbunjujuće
- "Instaliraj sada" gumb samo ako preglednik podržava `beforeinstallprompt` (Chrome na Androidu) — Samsung Internet, Firefox i mnogi drugi preglednici to NE podržavaju

Rezultat: korisnik vidi samo tekstualne upute bez funkcionalnog gumba.

### Rješenje

Redizajnirati Install stranicu tako da:

1. **Automatski prikaže samo detektiranu platformu** (Android/iOS/desktop) umjesto svih kartica
2. **Na Androidu bez `beforeinstallprompt`**: prikazati vizualne upute specifične za Samsung Internet (⋮ → Dodaj stranicu na → Početni zaslon) i za Chrome (⋮ → Instaliraj aplikaciju) s prepoznavanjem preglednika
3. **Na iOS-u**: prikazati Safari-specifične upute s ikonama (Share → Dodaj na početni zaslon)
4. **Dodati link na APK download** kao alternativu za Android korisnike koji žele nativnu verziju
5. **Ukloniti tab "Upute"** — premjestiti samo najbitnije info u install tab, smanjiti vizualni šum
6. **Prikazati ostale platforme** u sklopivoj sekciji "Ostale platforme" na dnu

### Izmjene

**`src/pages/Install.tsx`**:
- Detektirati preglednik (Samsung Internet, Chrome, Firefox, Safari) uz platformu
- Prikazati primarne upute samo za detektiranu kombinaciju platforma+preglednik
- Dodati vizualne korake sa screenshotima/ikonama preglednika
- Samsung Internet: "⋮ → Dodaj stranicu na → Početni zaslon"
- Chrome Android: Ako nema `deferredPrompt`, "⋮ → Instaliraj aplikaciju"
- Opcionalni APK link na dnu za nativnu verziju
- Ukloniti Tabs komponentu — sve na jednoj čistoj stranici
- Ostale platforme u Collapsible sekciji

### Rezultat
Korisnik odmah vidi jasne, specifične upute za svoj uređaj i preglednik, bez zbunjujućih opcija za druge platforme.

