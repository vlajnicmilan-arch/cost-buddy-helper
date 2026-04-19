
Problem sam sada precizno locirao. Nije do toga da “možda” publish nije prošao, nego do stvarne rupe u kodu.

Što je konkretno krivo:
1. U općem unosu transakcija `src/hooks/useExpenseCRUD.ts` postoji poziv na `notify-project-transaction` preko `invokeNotifyFunction(...)`.
2. Ali u projektnom ekranu `src/components/projects/ProjectTransactionsTab.tsx` transakcije se spremaju direktno u `expenses` tablicu i nakon spremanja se nigdje ne poziva `notify-project-transaction`.
3. Zato se u tom toku ne stvara:
   - zapis u `notifications`
   - push pokušaj
   - push log
4. Znači: backend nije ni dobio naredbu da pošalje obavijest. Zato nema ni in-app ni phone push.
5. Dodatno, `TransactionNotesThread.tsx` za projektne napomene još koristi stari `supabase.functions.invoke(...)` umjesto novog pouzdanijeg helpera.

Do I know what the issue is?
Da. Glavni problem je da projektni CRUD flow zaobilazi notification helper i uopće ne okida notify funkcije.

Plan popravka:
1. U `src/components/projects/ProjectTransactionsTab.tsx`
   - nakon uspješnog dodavanja projektne transakcije pozvati `invokeNotifyFunction({ functionName: 'notify-project-transaction', ... })`
   - nakon uspješnog uređivanja projektne transakcije također pozvati isti notify za `updated`
   - ostaviti to kao fire-and-forget da spremanje transakcije ne blokira
2. U `src/components/TransactionNotesThread.tsx`
   - zamijeniti stari `supabase.functions.invoke('notify-note-added')` s `invokeNotifyFunction(...)`
   - tako i komentari u projektima dobivaju isti pouzdani trag u dijagnostici
3. U `src/hooks/useProjectPendingTransactions.ts`
   - pregledati treba li pri odobrenju pending projektne transakcije također slati obavijest ostalim članovima
   - ako da, dodati isti notify poziv nakon approve
4. Provjeriti i uskladiti poruke/status logiku
   - da se notifikacije šalju samo za stvarne promjene
   - da se ne šalju duplikati kad nema relevantne promjene
5. Testirati cijeli lanac
   - dodavanje transakcije unutar projekta
   - uređivanje transakcije unutar projekta
   - dodavanje note na projektnu transakciju
   - provjera da nastane in-app zapis i push pokušaj/log

Tehnički detalji:
- Iskoristit ću već postojeći `src/lib/notifyHelper.ts`
- Neću dirati auto-generirani Supabase client
- Neću uvoditi novu arhitekturu nego ću uskladiti projektni flow s već postojećim ispravnim obrascem iz `useExpenseCRUD.ts`

Očekivani rezultat:
- Kad se transakcija doda iz projekta, odmah će se okinuti isti notify lanac kao i u ostalim dijelovima aplikacije
- Ako push opet negdje zapne, barem ćemo imati trag
- In-app obavijesti više neće izostati samo zato što funkcija nikad nije bila pozvana
