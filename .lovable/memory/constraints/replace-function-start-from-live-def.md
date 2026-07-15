---
name: CREATE OR REPLACE — kreni od žive definicije
description: Svaki CREATE OR REPLACE postojeće PL/pgSQL funkcije mora krenuti od pg_get_functiondef, nikad od stare migracijske datoteke.
type: constraint
---
Svaki `CREATE OR REPLACE FUNCTION` za funkciju koja već postoji u produkciji MORA početi od žive definicije dohvaćene s `SELECT pg_get_functiondef('<schema>.<fn>'::regproc)` — nikad od stare migracijske datoteke. Migracijske datoteke pokazuju stanje u trenutku pisanja, ne trenutno stanje: između njih su mogle biti druge migracije/hotfixevi (npr. Faza 4, 5, 6, hotfixevi). Prepisivanje iz stare datoteke gazi te međuizmjene i uzrokuje tihe regresije.

**Why:** 15.7.2026. Faza 7 trigger `project_decision_step_after` prepisan iz stare Faze 3 datoteke → izgubljeni Faza 4 dijelovi (`notify-decision-closed` mail + `last_reminder_sent_at`/`overdue` reset). Produkcija je prestala slati e-mail sažetke na zatvaranju odluka.

**How to apply:**
1. Prije bilo koje izmjene funkcije: `psql -Atc "SELECT pg_get_functiondef('schema.fn'::regproc)" > /tmp/live_fn.sql`.
2. U tu živu verziju uvrsti tražene izmjene (diff, ne rewrite).
3. Nakon migracije verificiraj u živoj bazi da SVI ranije prisutni ključni sadržaji (`grep`) i dalje postoje.
