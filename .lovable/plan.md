

## Trenutna logika i prijedlog

### Što sam pronašao
Na glavnom dashboardu (`src/pages/Index.tsx` → `src/components/home/PersonalModeView.tsx` → `SummarySection.tsx`) prikazuju se 3 kartice: **Saldo**, **Prihodi**, **Rashodi**.

Logika računanja je u `src/hooks/useExpenses.ts` (ili sličnom agregatoru) i **trenutno zbraja SVE transakcije** koje su učitane u trenutnom prikazu — bez filtera po mjesecu. To znači:
- "Prihodi" = svi prihodi ikad zabilježeni
- "Rashodi" = svi rashodi ikad zabilježeni

### Zašto je tako (povijesno)
Dashboard je izvorno bio zamišljen kao "pregled svih podataka" jer je `useExpenseFetch` već paginirano dohvaćao sve transakcije za korisnika, pa je suma bila trivijalna. Filter po mjesecu nije nikad eksplicitno dodan — vjerojatno propust iz ranih verzija.

### Zašto Vinkin osjećaj ima smisla
"Saldo" je trenutno stanje računa (kumulativ ima smisla). Ali "Prihodi" i "Rashodi" kao **kumulativ od početka vremena** ne govore ništa korisno — broj samo raste i nema kontekst. Standard u financijskim aplikacijama (Revolut, Wallet, YNAB) je **mjesečni prikaz**.

### Prijedlog

**1. Prihodi i Rashodi → samo tekući mjesec**
- Filter: `date >= startOfMonth(now) && date <= endOfMonth(now)`
- Saldo OSTAJE kumulativ (zbroj salda svih aktivnih izvora — to je već ispravno)

**2. Vizualna oznaka da je mjesečno**
- Ispod naslova "Prihodi" / "Rashodi" mali tekst: **"travanj 2026"** (ili `format(now, 'LLLL yyyy')` lokalizirano)
- Diskretno, sivo, manjim fontom

**3. Usporedba s prošlim mjesecom (bonus)**
- Mali postotak ispod iznosa: `+12% vs ožujak` ili `-5% vs ožujak`
- Zelena ako prihodi rastu / rashodi padaju, crvena obrnuto
- Isti pattern već postoji u `BusinessDashboard.tsx` — preuzimam logiku

**4. Što NE diram**
- Saldo karticu (ostaje kumulativ aktivnih računa)
- Filter transakcija ispod (lista i dalje pokazuje sve, korisnik ima zasebne filtere)
- Izračun grafova, kategorija, budgeta — to već imaju vlastite filtere
- Bazu, RLS, edge funkcije

### Datoteke za izmjenu
- `src/components/home/SummarySection.tsx` — dodati mjesečni filter za income/expense + UI oznaka mjeseca + delta vs prošli mj.
- `src/i18n/locales/{hr,en,de}.json` — ključevi `summary.thisMonth`, `summary.vsLastMonth`

### Pitanje prije implementacije
Imam jedno pitanje o opsegu — samo da budem siguran što Vinka želi.

