

## Plan: Popravak slanja pozivnice za budžet putem emaila

### Dijagnoza

Pregledom edge function logova vidljivo je da se `send-member-invitation` funkcija pokreće (boot), ali nema logova o obradi zahtjeva — što ukazuje na to da funkcija nije ispravno deployana ili da postoji tihi crash.

Kod same funkcije je ispravan — logika za budget pozivnice radi s pravilnim tablicama i kolonama.

### Popravak

#### 1. Redeploy `send-member-invitation` edge funkcije
Funkcija treba biti ponovo deployana kako bi se osiguralo da najnovija verzija koda bude aktivna.

#### 2. Poboljšanje error handlinga u funkciji
Dodati detaljnije logiranje na početku obrade zahtjeva kako bi se budući problemi lakše dijagnosticirali:
- Log na početku `try` bloka: "Processing request..."
- Log prije i poslije `listUsers` poziva
- Log tijela zahtjeva (bez osjetljivih podataka)

#### 3. Poboljšanje klijentskog error handlinga
U `BudgetMembersTab.tsx`, prikazati detaljniju poruku greške korisniku umjesto generičkog "Greška":
- Logirati cijeli error objekt
- Prikazati `error.message` ako postoji

### Datoteke za izmjenu
- `supabase/functions/send-member-invitation/index.ts` — poboljšano logiranje
- `src/components/budget/BudgetMembersTab.tsx` — bolji error handling
- Redeploy edge funkcije

