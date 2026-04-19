

## Plan: Jasniji prikaz prijenosa između računa

### Problem
Trenutno se prijenosi (`type: 'transfer'`) prikazuju kao obični redovi — korisnica ne vidi jasno **odakle → kamo** je novac išao.

### Kako prijenosi rade u bazi (istraženo)
Svaki prijenos = **2 zapisa** u `expenses` tablici s istim opisom i datumom:
- jedan s `type: 'transfer'` koji oduzima s **izvornog** računa (`payment_source` ili `payment_source_card_id`)
- drugi koji dodaje na **odredišni** račun

Trenutno `TransactionItem` prikazuje samo jedan izvor — onaj zapisan na tom retku — pa korisnica vidi pola priče.

### Rješenje: Pair-matching + vizualni prikaz "Iz → U"

**1. Helper `src/lib/transferMatching.ts`** (novo)
- Funkcija `matchTransferPairs(expenses)` koja grupira parove prijenosa po ključu: `description + amount + date (±60s) + user_id`
- Vraća `Map<expenseId, { fromSource, toSource, fromCardId?, toCardId? }>`
- Radi i za **postojeće** prijenose — bez migracije baze

**2. Nova komponenta `src/components/TransferTransactionItem.tsx`**
- Prikazuje prijenos u jednom retku s jasnim layoutom:
  ```
  🔄  Prijenos između računa            -50,00 €
      💳 Visa Gold  →  💵 Gotovina      19. tra
  ```
- Koristi `ArrowRight` ikonu, ikone/imena izvora iz `getPaymentSourceInfo` + custom payment sources
- Boja iznosa: neutralna (ne crvena/zelena) jer je interna tranzicija
- Klik otvara `TransactionDetailDialog` (postojeći)

**3. Dedup u listama** — `src/components/home/TransactionListSection.tsx` + `VirtualTransactionList`
- Kad se prikazuje par prijenosa, prikazujemo **samo jedan red** (onaj s `type: 'transfer'` ili prvi po ID-u)
- Drugi zapis para se filtrira iz prikaza (ali ostaje u bazi za korektnost salda)
- Counter "X transakcija" računa parove kao 1

**4. `TransactionItem.tsx` routing**
- Ako je `expense.type === 'transfer'` i postoji par → renderira `TransferTransactionItem`
- Inače → postojeći prikaz

**5. `TransactionDetailDialog`** — proširenje za prijenose
- Sekcija "Detalji prijenosa": Iz računa, U račun, Iznos, Datum
- Brisanje prijenosa briše **oba** zapisa (već postoji slična logika za parove)

**6. i18n ključevi**
- `transactions.transfer.from` ("Iz"), `.to` ("U"), `.title` ("Prijenos između računa")
- HR / EN / DE

### Što NE diram
- Bazu, RLS, postojeće zapise (radi automatski na svim postojećim prijenosima)
- Logiku spremanja prijenosa u `AddExpenseDialog`
- Sortiranje, filtere, izračun salda
- Bulk akcije (par se tretira kao 2 zapisa pri brisanju)

### Datoteke
**Novo:**
- `src/lib/transferMatching.ts`
- `src/components/TransferTransactionItem.tsx`

**Izmjena:**
- `src/components/TransactionItem.tsx` (routing)
- `src/components/home/TransactionListSection.tsx` (dedup)
- `src/components/VirtualTransactionList.tsx` (dedup)
- `src/components/TransactionDetailDialog.tsx` (sekcija prijenosa)
- `src/i18n/locales/{hr,en,de}.json`

