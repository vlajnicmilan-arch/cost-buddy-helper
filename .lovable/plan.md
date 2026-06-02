Uzrok je jasan: dio “Za pažnju” koristi `dismiss_notification` i ostavlja zapis kao `dismissed`, pa se isti problem ne vraća 7 dana. Ali zvono za obavijesti koristi direktni `DELETE` nad `notifications`; kad se izbriše aktivno upozorenje s `dedup_key`, `useIssueReconciler` ga nakon kratkog vremena ponovno detektira i ponovno umetne.

Plan popravka:

1. Uskladiti brisanje u zvonu s postojećim “Za pažnju” tokom
   - Za aktivna issue upozorenja (`dedup_key` / `status='active'` / tipovi poput `budget_burn`, `project_loss_zone`, `overdue_invoice`) umjesto fizičkog brisanja pozvati postojeći RPC `dismiss_notification`.
   - Za obične obavijesti bez issue logike zadržati stvarno brisanje.

2. Sakriti dismissed/resolved zapise iz zvona
   - `useNotifications` će dohvaćati samo vidljive obavijesti, tj. aktivne zapise.
   - Kad se issue dismiss-a, lokalno će odmah nestati iz liste i neće se vraćati nakon refetcha.

3. Popraviti “Obriši sve”
   - Ne smije hard-deleteati issue upozorenja jer se onda regeneriraju.
   - Vidljive issue obavijesti će se dismissati, a obične obavijesti obrisati.
   - Badge/unread count se ažurira prema stvarnom vidljivom stanju.

4. Pojačati realtime sinkronizaciju
   - Na `UPDATE` gdje obavijest postane `dismissed` ili `resolved`, ukloniti je iz lokalnog stanja.
   - Na `DELETE` ukloniti je iz lokalnog stanja.
   - INSERT ostaje kao sada, ali samo za vidljive aktivne obavijesti.

5. Provjera
   - Provjeriti da brisanje iz zvona uklanja obavijest odmah.
   - Provjeriti da se isto upozorenje ne vrati nakon sljedećeg reconcile ciklusa.
   - Provjeriti da obične obavijesti i dalje mogu biti trajno obrisane.