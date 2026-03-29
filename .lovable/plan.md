

## Plan: Filtriranje izvora plaćanja — samo korisnikovi izvori

### Problem
Trenutno se lista izvora plaćanja u izvješćima gradi iz svih transakcija (`expenses`), što može prikazati izvore koje korisnik ne posjeduje ili ne koristi. Treba prikazati samo izvore koje korisnik stvarno ima.

### Rješenje

**Datoteka:** `src/components/reports/ReportsDialog.tsx`

Promijeniti `uniquePaymentSources` useMemo da:

1. **Custom izvori** — uzeti iz `customPaymentSources` (hook već dohvaća samo korisnikove vlastite + dijeljene). Za svaki prikazati broj transakcija iz `expenses` (može biti 0).
2. **Ugrađeni izvori (cash, bank, card)** — prikazati samo one koji se pojavljuju u korisnikovim transakcijama (bar 1 transakcija).
3. **Sortirati** — custom izvori prvi (po sort_order), zatim ugrađeni po broju transakcija.

Ovime korisnik vidi samo svoje izvore plaćanja, a ne "tuđe" ili nekorištene ugrađene izvore.

### Tehnički detalji
- `customPaymentSources` već postoji u komponenti (line 22, hook poziv)
- Mijenja se samo `uniquePaymentSources` useMemo (linije 354-370)
- Logika: iterirati `customPaymentSources` za custom izvore, zatim skenirati `expenses` za ugrađene izvore koji nisu custom

