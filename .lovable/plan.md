

## Admin – preglednost menija na mobitelu

### Problem
9 tabova (`Pulse, Stats, Users, Sub, Bug, Slanje, Push, APK, Diag`) stiješnjeno u `grid-cols-9` na 384px ekranu = svaki tab ~42 px, ikone i tekst se sudaraju, oznake tipa "Slanje", "Diag", "Sub" su skraćenice koje korisnik ne razumije.

### Rješenje – horizontalno klizni meni s grupiranjem

**1. Zamjena `grid-cols-9` s vodoravnim scroll-om**
- TabsList postaje `flex` s `overflow-x-auto`, snap scroll, skriveni scrollbar
- Svaki tab je `flex-shrink-0` s minimalnom širinom (npr. `min-w-[88px]`) — tabovi se više ne zbijaju, već klize lijevo/desno
- Aktivni tab automatski skrolira u vidljivo područje (`scrollIntoView` na `activeTab` change)
- Suptilna sjena s lijeve/desne strane signalizira da ima još sadržaja

**2. Logičko grupiranje u 3 sekcije s vizualnim separatorom**
- **Pregled**: Pulse · Statistika
- **Korisnici**: Korisnici · Pretplate · Prijave
- **Komunikacija**: Obavijesti · Push log
- **Sustav**: APK · Dijagnostika

Tanki vertikalni divider (`w-px bg-border`) između grupa daje strukturu bez gubitka prostora.

**3. Pune hrvatske oznake umjesto skraćenica**
- Brisanje `<span className="sm:hidden">` (skraćenica)
- Svuda samo jedan label: "Pulse", "Statistika", "Korisnici", "Pretplate", "Prijave", "Obavijesti", "Push log", "APK", "Dijagnostika"
- Ikona iznad teksta, **vertikalno raspored** (umjesto horizontalnog) — manje širine, čitljivije

**4. Veći touch targeti**
- Visina taba `h-14` (umjesto `h-9`) — zadovoljava 44 px minimum iz brand pravila
- Ikona 4×4, label `text-[11px]` ispod ikone
- Padding po osi `px-3 py-1.5`

**5. Sticky header pri scrollu sadržaja**
- TabsList dobiva `sticky top-0 z-10 bg-background/95 backdrop-blur` da meni ostaje vidljiv pri scrollu duge liste korisnika/prijava

### Vizualizacija (384 px viewport)

```text
┌────────────────────────────────────────────┐
│ ← Admin                                    │
├────────────────────────────────────────────┤
│ ┃ 💗     📊  ┃ 👥    💳    🐛   ┃ 🔔   📲┃→│  ← klizno
│ ┃Pulse  Stat ┃Kor.  Pret.  Prij ┃Obav. Push│
└────────────────────────────────────────────┘
```

Korisnik vidi 3-4 taba odjednom + jasno vidi da može kliziti dalje. Aktivni tab uvijek u fokusu.

### Datoteke koje se mijenjaju

| Datoteka | Promjena |
|---|---|
| `src/pages/Admin.tsx` | TabsList: `flex overflow-x-auto`, vertikalni layout svakog TabsTrigger-a, separator-divovi između grupa, auto-scroll na promjenu, sticky pozicioniranje, pune labele |

### Što se NE mijenja
- Broj tabova ostaje 9
- Sav sadržaj svake kartice
- Logika učitavanja, RLS, edge funkcije
- Drugi dijelovi Admin stranice (statCard, lista korisnika itd.)

### Očekivani ishod (na 384 px)
- Tabovi imaju dovoljno prostora, ikona i label se ne sudaraju
- Pune hrvatske oznake umjesto "Sub", "Slanje", "Diag"
- Klizanje lijevo-desno za pristup ostalim tabovima
- Aktivni tab uvijek vidljiv (auto-scroll)
- Vizualne grupe pomažu pronalasku po funkciji
- Sticky meni pri dugim listama (Korisnici, Push log)

