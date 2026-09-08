# Dijagnoza: baza ne odgovara (8.9., ~23:58 Zagreb)

Samo mjerenja. Ništa nije mijenjano, restartano ni prekinuto.

## Što je izmjereno

| Provjera | Rezultat |
|---|---|
| Status backenda (Lovable Cloud) | GREŠKA `backend_unreachable_db` — probe prema podatkovnom sloju istekao |
| Zdravlje baze (metrike) | Nedostupno — zahtjev za metrikama istekao bez odgovora |
| SQL preko upravljačkog API-ja (`select count(*) from pg_stat_activity`) | Istek, bez odgovora servera |
| `psql` preko poolera (port 6543) | `FATAL: (EAUTHQUERY) authentication query failed: connection to database not available` |
| REST `GET /rest/v1/project_templates?select=id&limit=1` | Istek nakon 20 s, HTTP kod 000 |
| `GET /auth/v1/settings` | Istek nakon 20 s, HTTP kod 000 (dakle sada i auth pada, za razliku od ranije) |
| Kontrolna mreža iz sandboxa (`example.com`, `api.supabase.com`) | 200 / 401 u < 0,15 s — izlaz na internet je ispravan |
| Logovi edge funkcije `categorize-transaction` | Nema zapisa |
| `postgres_logs`, `edge_logs` (analitika) | Prazno — ni log pipeline ne vraća podatke |
| Stanje projekta | Nije pauziran. Veličina instance: **Tiny** |

## Što se iz toga zna, a što ne

Zna se:
- Instanca baze ne prihvaća nove konekcije. Pooler ne može izvršiti ni vlastiti auth-upit ("connection to database not available") — to je poruka koja dolazi kad sam Postgres ne odgovara, a ne kad su konekcije potrošene ili je upit spor.
- Otkaz se proširio: uz REST sada ne odgovara ni auth, ni metrike, ni platformski SQL kanal.
- Projekt nije pauziran i nije riječ o mreži iz naše strane.

Ne zna se (i ne može se saznati dok baza ne odgovara):
- Točke 1–4 iz naloga — CPU, I/O budžet, memorija, broj konekcija, veličina baze, `pg_stat_activity`, `pg_locks`, VACUUM/reindex/backup/pg_cron. Svi ti podaci se čitaju IZ baze ili iz metrika koje također ne odgovaraju. Ne izmišljam brojke: trenutno ih nema.
- Točka 5 — promjene postavki projekta u zadnjih sat vremena: nemam alat koji čita povijest promjena plana/limita; jedino što vidim je trenutno stanje (nije pauzirano, Tiny).

O objavama u 23:29 i ~23:50: nijedna ne dira shemu i nijedna nije mogla oboriti auth servis, koji je odvojen od aplikacijskog koda. Edge funkcije `categorize-transaction` i `parse-receipt` pozivaju se samo na korisničku akciju (unos/sken) i nemaju petlju; njihovi logovi su prazni. Ne mogu ih ni isključiti ni potvrditi kao uzrok dok logovi ne prorade, ali obrazac otkaza (pad cijele instance, uključivo auth) ne odgovara opterećenju iz aplikacije.

## Najmanji zahvat — prijedlog, odluka je vlasnikova

1. **Ponovno pokretanje instance baze.** To je jedini zahvat koji je ovdje na raspolaganju i najmanji je mogući: instanca ne prihvaća konekcije, pa nema što "nježnije" pokušati — nema upita koji se može prekinuti niti brave koja se može otpustiti bez pristupa. Restart prekida sve otvorene transakcije i obično traje 1–3 minute, tijekom kojih je aplikacija svakako nedostupna (kao i sada). Trebam izričito "restartaj" da to pokrenem.
2. Odmah nakon što se javi: pročitati zdravlje baze, `pg_stat_activity` i `pg_locks` te postgres logove oko 23:58 — tada će se vidjeti pravi uzrok (OOM, iscrpljen I/O budžet, zaglavljena transakcija).
3. Ako se ispostavi da je uzrok nedostatak memorije ili I/O na **Tiny** instanci, sljedeći korak je povećanje instance. Ne predlažem to prije nego se vide brojke.

Ako restart ne vrati instancu, to više nije samoposlužni slučaj i ide na podršku.
