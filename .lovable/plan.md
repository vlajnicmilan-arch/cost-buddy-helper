# Dijagnoza: Petar bez satnice u projektu „Kašteli"

Ovo je samo dijagnoza. Kod i baza nisu mijenjani. Ispod je prijedlog popravka koji čeka nalog „gradi".

## 1. Kako vlasnik danas dodaje radnika sa satnicom
- Ekran: Projekt → **Tim projekta** → podkartica **Radnici** (`ProjectTeamTab` → `ProjectWorkersTab`) → gumb za dodavanje radnika. Otvara se `ProjectWorkerDialog` s imenom, pozicijom i satnicom. Spremanje upisuje redak u `project_workers`.
- Povezivanje s postojećim članom: u istom prozoru, kad zapis radnika već postoji (uređivanje), pojavi se okvir **„Već je član projekta?"** s izborom člana i gumbom **„Poveži"**. Gumb zove RPC `link_worker_to_member`, koji postavlja `project_workers.user_id` i **naknadno prenosi postojeće dnevnike** u `project_work_entries` (vraća `backfilled`).
- Osoba iz „Ljudi": `useWorkerIdentityAttach` postavlja `project_workers.worker_id`. Postoji i drugi put: „+ Osoba" u „Ljudi" s odabranim projektom stvara angažman. Okidač `_person_link_inherit_down` tada sam upisuje `user_id`, ako osoba ima `linked_user_id`. Petrova osoba `99e0c1c4…` ima `linked_user_id`.
- Iz pozivnice se zapis radnika ne stvara. Pozivnica s ulogom `worker` daje samo članstvo (`project_members`). Funkcija za prihvat pozivnice ne dira `project_workers`.

## 2. Zašto u Kaštelima nema tog koraka
- To nije regresija i nema commita koji je promijenio tok. Taj korak nikad nije bio automatski:
  - Sve Petrove pozivnice (5.–7. mj. i 13.9.) imaju `worker_id` prazan.
  - U ranijim projektima vlasnik je ručno napravio zapis radnika 30 s do 15 min nakon prihvata pozivnice (npr. 25.5. u 14:59:11 članstvo, u 14:59:42 zapis radnika).
  - U Kaštelima taj ručni drugi korak jednostavno nije napravljen.
- U datotekama tima, radnika i „Ljudi" od 1.9. postoji jedan commit (`ff47ad7c0`, 9.9.). Commit `6969e9c05` (9.9.) dira prava modula, ne radnike.
- Stvarni kvar je u dizajnu:
  - Aplikacija dopušta ulogu „Radnik" bez zapisa radnika i ništa ne upozorava.
  - Okvir „Poveži" vidi se tek unutar postojećeg zapisa radnika, a ne na članu.
  - Zato vlasnik s člana nema put do satnice.
- Nisam provjerio u pregledniku vidi li Milan podkarticu „Radnici" (`hasAccess('workforce')`, razina `pro`). Ima aktivne dodjele `projekti` i `pro_legacy`, pa je vjerojatno vidi. To je nepotvrđeno.

## 3. Što vlasnik vidi od Petrovih 37 h
- U **Dnevniku rada** vidi svih 5 zapisa s tekstom i satima (`useProjectWorkLogs` čita `project_work_logs`).
- Ne vidi sažetak „sati po radniku" ni trošak rada. Oba se računaju iz `project_work_entries` × satnica iz `project_workers`.
- Okidač `sync_work_log_to_entry` traži `project_workers` po (`project_id`, `user_id`). Kad ga ne nađe, preskače bez greške („Korisnik još nije mapiran"). Zato u Kaštelima ima 0 zapisa sati.

## 4. Prelaze li postojeći logovi automatski
- **Samo stvaranje** zapisa radnika s `user_id` ne prenosi stare logove. Okidač radi samo na novi ili izmijenjeni dnevnik.
- **Gumb „Poveži"** (`link_worker_to_member`) prenosi sve postojeće logove sa satima.
- Put „+ Osoba" iz „Ljudi" (okidač `_person_link_inherit_down`) po kodu ne radi prijenos.
- Dupli upis sprječava jedinstveni ključ `project_work_entries (worker_id, work_date)`. I okidač i prijenos rade upsert `ON CONFLICT (worker_id, work_date) DO UPDATE`. Ako Petar isti dan upiše ponovno, postojeći redak se prepisuje, ne nastaje drugi.
- Siguran prijenos već postoji: vlasnik u Kaštelima doda radnika Petra sa satnicom, zatim ga otvori i klikne „Poveži" → Petar. Očekivano: `backfilled = 5`, 37 h.
- Rizik: prijenos radi upsert, pa bi prepisao ručno upisane sate za isti dan. Za Kaštele takvih nema (0 redaka).

## 5. Drugi projekti u istom stanju
Upit samo za čitanje: članovi s ulogom `worker`, bez `project_workers`, u neobrisanim projektima.
- Rezultat: **1 projekt, 1 korisnik**. To su Kašteli (`533abe5a…`), Petar, 5 logova / 37 h.
- Nijedan drugi projekt ni korisnik nije u tom stanju.

## 6. Prijedlog popravka (opis)
1. **Upozorenje na članu:** na članu s ulogom „Radnik" bez zapisa radnika prikazati obavijest „Nema satnice — sati se ne obračunavaju" s gumbom „Postavi satnicu". Gumb otvara postojeći `ProjectWorkerDialog` s već odabranim članom.
2. **Spremanje povezuje odmah:** u tom prozoru spremanje s odabranim članom stvara zapis radnika i odmah zove postojeći `link_worker_to_member`, pa se prošli dnevnici prenesu. Nema novog mehanizma ni SQL-a.
3. **Poveznica s „Ljudi":** ako osoba iz „Ljudi" ima `linked_user_id` = taj član, ponuditi je kao osobu (postojeći `useWorkerIdentityAttach`).
4. **Pri prihvatu pozivnice:** baza se ne mijenja. Vlasnik dobiva isti poziv na akciju u timu.

Dokaz:
- Vitest: član „Radnik" bez zapisa radnika pokazuje upozorenje. Spremanje s članom zove link RPC. Član sa zapisom ne pokazuje upozorenje.
- SQL čuvar: dnevnik prije povezivanja, zatim povezivanje daje `backfilled = N`. Ponovni upis istog dana ne stvara duplikat. Drugo povezivanje ne udvostručuje sate.
- Na živim podacima: vlasnik sam poveže Petra u Kaštelima. Zatim upit pokazuje 5 zapisa sati i 37 h u `project_work_entries`, a upit iz točke 5 vraća 0 redaka.
