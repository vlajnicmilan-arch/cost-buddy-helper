
# Test pass za #3 — Rule B (anchor cuts the whole calendar day)

Uski Vitest pass. Bez SQL fixa, bez UI-a, bez dirana ostalih 8 stavki.

## 1. Gdje pravilo živi danas

Kanonska logika je u Postgres funkciji `public.recompute_custom_source_balance` (migracija `20260624131214`). U `src/` ne postoji čisti TS helper koji zrcali pravilo — `useBalanceUpdater.ts` samo zove RPC. Znači: nema postojećeg čistog mjesta za TS test.

**Najmanji siguran način:** dodati uski pure-TS port pravila B kao izvršivu specifikaciju i testirati njega. Port se NE uvozi iz runtime koda; služi isključivo testovima kao "ako se SQL promijeni, ovaj test pukne i to mora biti svjesna odluka". To je jedini način da se Rule B kodira u Vitestu bez dotjerivanja Postgresa.

## 2. Što se dodaje

**Dva nova fajla, ništa drugo:**

- `src/lib/balance/anchorBalance.ts` — pure funkcija `computeAnchoredBalance({sourceId, anchorDate, anchorBalance, expenses})`. Vraća `anchorBalance + SUM(post-anchor-day valid signed contributions)`. Bez vanjskih ovisnosti, bez importa iz `supabase/`. JSDoc na vrhu eksplicitno navodi Rule B i da je fajl test-only specifikacija.
- `src/lib/balance/anchorBalance.test.ts` — Vitest suite sa 7 scenarija:
  1. transakcije prije anchor dana → isključene
  2. transakcije na anchor dan (čak i s vremenom nakon anchor sata) → isključene
  3. transakcije nakon anchor dana → uključene
  4. `expense_nature === 'correction'` → nikad ne računa
  5. `deleted_at !== null` → nikad ne računa
  6. mixed scenarij: `anchor + post-day valid sum` = 150 € (sa transferima u oba smjera, drugim sourceom, deleted/correction šumom)
  7. čitljivost pravila: isti iznos na anchor dan = 100 €, na dan-poslije = 300 € — pravilo B jasno iz testa, ne skriveno u helperu

## 3. Što se NE dira

- nikakva migracija
- nikakav SQL
- nikakav UI / helper text
- nikakav refaktor `useBalanceUpdater` ili payment-source sustava
- nikakav fix za #1, #2, #4, #9 ili ostale stavke

## 4. Zašto pure-TS port nije bilo moguće izbjeći

Postojeći kod pravilo zna samo preko RPC poziva na Postgres. Vitest ne može pozvati Postgres funkciju. Bilo bi ili (a) podići realnu DB u testu — širi scope nego što tražiš, ili (b) napisati uski TS port koji zrcali pravilo i držati ga kao spec. Odabran (b) jer ne mijenja runtime ponašanje i daje regresijsku mrežu odmah.

## 5. Status nakon ovog passa

- gdje su testovi: `src/lib/balance/anchorBalance.test.ts`
- pokriveni scenariji: 7, navedeni iznad
- jesu li prošli: bit će potvrđeno odmah po prebacivanju u build mod
- spremnost #3 za kasniji fix pass: **da** — Rule B je sada izvršiva specifikacija; budući SQL/UI fix može se mjeriti spram ovog testa
