## Cilj

Tekstovi na karticama projekata u "Aktivni projekti" stripu su trenutno predugi i opisni. Korisnik treba na **prvi pogled** vidjeti:
1. **Stanje** projekta (semafor + profit — već postoji)
2. **Zaključak** (kratko, jedna fraza)
3. **Što treba napraviti** (kratka akcija)

Bez tablice podataka, bez dugih rečenica.

## Princip

- Raspored kartica ostaje isti — semafor i profit blok netaknuti.
- Mijenja se samo **tekst** u dva mjesta: AI warning red (žuto/crveno) i status linija (zeleno).
- Format: **`Zaključak — akcija`**, max ~6 riječi.
- I dalje deterministički iz podataka, bez AI poziva.

## Konkretni novi tekstovi (HR primjer)

### AI warning (žuto / crveno)
Trenutno:
- Žuto: *"Marža je 17% — pregledajte troškove projekta dok je još vrijeme."*
- Crveno: *"Marža je samo 6% — profit je kritičan, hitno reagirajte."*

Novo:
- Žuto: *"Marža niska · 17% — smanji troškove"*
- Crveno: *"Marža kritična · 6% — hitno reagiraj"*

### Status linija (zelene kartice)
Trenutno → Novo:
- *"Projekt je pauziran"* → *"Pauzirano"*
- *"Kreće za 5 dana"* → *"Kreće za 5 dana"* (već kratko, ostaje)
- *"Čeka početak · kreće 15.5.2026"* → *"Čeka početak · 15.5."*
- *"Rok prošao — projekt još otvoren"* → *"Rok prošao · zatvori projekt"*
- *"Tek započeo — još nema unosa"* → *"Tek započeo · dodaj unos"*
- *"Stabilan — bravo!"* → *"Sve pod kontrolom"*
- *"Pripremna faza · 16% budžeta"* → *"Priprema · 16% budžeta"*
- *"U punom zamahu · 45% budžeta"* → *"U tijeku · 45% budžeta"*
- *"Pred kraj · preostalo 18%"* → *"Pri kraju · 18% budžeta"*
- *"U tijeku · 12 unosa"* → *"U tijeku · 12 unosa"* (ostaje)

Sve poruke uvijek imaju jasan **zaključak** (stanje), a gdje god je moguće još i **mikro-akciju** (`smanji troškove`, `hitno reagiraj`, `dodaj unos`, `zatvori projekt`).

## Promjene u kodu

### 1. `src/i18n/locales/hr.json` / `en.json` / `de.json`
- Skratiti vrijednosti pod `projects.health.aiWarning.yellow` i `projects.health.aiWarning.red`.
- Skratiti vrijednosti pod `projects.statusLine.*` (paused, waitingStart, overdueOpen, justStarted, stable, prepPhase, inFullSwing, nearEnd).
- Dodati varijantu `waitingStart` koja koristi kraći datum (samo `dd.mm.`).

### 2. `src/lib/projectStatusLine.ts`
- `waitingStart` formatirati datum kao `dd.MM.` umjesto `toLocaleDateString()` (kraće, čišće).
- Ostalo ostaje (logika hijerarhije je ispravna).

### 3. `src/components/home/ActiveProjectsStrip.tsx`
- Bez strukturnih promjena. Render funkcije (`renderAiWarning`, `renderStatusLine`) već konzumiraju i18n ključeve — samim updateom prijevoda dobivamo nove kratke tekstove.

## Što se NE dira
- Semafor, profit blok, marža badge, layout, animacije.
- Logika za izračun health/margin.
- Hooks i fetch.

## QA
- Dujo (marža 17%) → *"Marža niska · 17% — smanji troškove"* (žuto).
- Radiona (stabilan, marža 50%) → *"Sve pod kontrolom"* (zeleno).
- Lucija i Mate (start_date u budućnosti) → *"Kreće za N dana"*.
- Projekt s 0 unosa → *"Tek započeo · dodaj unos"*.
- HR/EN/DE prijevodi rade i stanu u jedan red bez wrapanja na 200px širokoj kartici.
