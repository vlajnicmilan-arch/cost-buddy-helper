# Stress & Concurrency Harness — v1 (Faza 1: skeleton only)

Ovo je **test-infrastruktura**, ne feature. Cilj: dokazati da brojke ostaju
istinite pod navalom. Primarni FAIL je narušena invarijanta; latencija u v1
NIJE gate (samo report).

## Status

**Faza 1 (ova faza) — skeleton + env guard + local compose + seed + auth pool.**
Fase 2 (concurrency), 3 (k6), 4 (Playwright), 5 (report/CI) — svjesno stub.

## Preduvjeti (host stroj, ne Lovable sandbox)

- Docker + docker-compose
- Supabase CLI ≥ 1.180 (`supabase --version`)
- Node/Bun (za TS seed skripte)
- Min. resursi: 8 GB RAM, 4 core (za puni v1 volumen)

**Napomena**: Lovable sandbox nema Docker. `run-all.sh --smoke` mora se
izvršiti lokalno na developer/CI stroju.

## Jedna naredba

```bash
bash stress/bin/run-all.sh --smoke
```

Flow:

1. `guard-env.sh` — tvrdo pada ako URL nije `localhost` / `127.0.0.1`
2. `supabase start` — digne lokalni stack (Postgres + GoTrue + PostgREST)
3. `reset-db.sh` — `supabase db reset` + primijeni sve migracije
4. `pause-cron.sql` — snapshot + `UPDATE cron.job SET active = false`
5. `seed/seed.ts` — smoke seed (5 usera, 2 kruga, 2 projekta, 50 expenses)
6. `seed/loginSeedUsers.ts` ili `seed/tokens.ts` — auth pool → `stress/reports/tokens.json`
7. Ispis `READY`

Cleanup (uvijek, i na `trap ERR`):

- `resume-cron.sql` vraća original state iz `stress_cron_snapshot`
- `supabase stop` (osim ako `--keep-stack`)

## Auth strategija

`STRESS_AUTH_MODE` u `.env`:

- `login` (**default, robusnije**) — pravi `POST /auth/v1/token?grant_type=password`
  protiv lokalnog GoTrue-a. Sporije, ali imun na drift secreta.
- `mint` — čita `GOTRUE_JWT_SECRET` iz `supabase status --output env` i mint-a
  JWT lokalno. Brže, ali **fail-fast** ako secret nije dostupan.

**Nikakve hardcodeane tajne.** Ako `mint` ne može pouzdano doći do secreta,
skripta pada s eksplicitnom porukom kamo pogledati.

## Cron kontrola

Lokalni Supabase pokreće `pg_cron` schedulere. U stress runu **svi cron jobovi
se pauziraju** odmah nakon `db reset`, prije seeda:

- `pause-cron.sql` snima trenutno stanje u tablicu `stress_cron_snapshot`
  (auto-kreira ako ne postoji), zatim postavlja `cron.job.active = false` za sve.
- `resume-cron.sql` čita snapshot i vraća original `active` vrijednosti.

Sloj-2 testovi (Faza 2) će eksplicitno provjeriti `SELECT count(*) FROM cron.job
WHERE active` prije mjerenja — mora biti 0.

## Realtime — svjesno isključen

`docker-compose.stress.yml` **ne pokreće realtime servis**. Realtime pod 500 VU
može blokirati WAL i zamutiti mjerenje concurrency invarijanti. Ako se u v2
pokaže da treba, uvest ćemo poseban stress profil s realtime-om.

## Seed volumen

**Puni v1 volumen** (Faza 2+): 200 users, 20 krugova, 30 projekata, 15k expenses.

**Smoke volumen** (`--smoke` flag u Fazi 1): 5 users, 2 kruga, 2 projekta,
50 expenses. Dovoljno da se validira flow end-to-end bez čekanja 10+ min na seed.

Puni volumen se pokreće `bash stress/bin/run-all.sh --full` — u Fazi 1 to je
implementirano ali **nije runtime-verificirano**.

## Guard: fail-closed na non-local URL

`guard-env.sh` provjerava `STRESS_SUPABASE_URL` (iz `.env`):

- Prihvaća samo `http://localhost:*` ili `http://127.0.0.1:*`
- Sve ostalo → `exit 1` s porukom `REFUSING TO RUN AGAINST NON-LOCAL URL`

## Što NIJE u Fazi 1

- Sloj 2 (concurrency testovi)
- Sloj 1 (k6)
- Sloj 3 (Playwright smoke)
- Report generator
- CI workflow
- Performance gate (v2 odluka, ne v1)

## Reprodukcija

```bash
cd stress
cp env.example .env
# uredi .env po potrebi
bash bin/run-all.sh --smoke
```
