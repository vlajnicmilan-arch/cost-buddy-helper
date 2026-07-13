# Stress & Concurrency Harness — v1

Ovo je **test-infrastruktura**, ne feature. Cilj: dokazati da brojke ostaju
istinite pod navalom. Primarni FAIL je narušena invarijanta; latencija u v1
NIJE gate (samo report).

## Status

**Faza 1 — skeleton + env guard + seed + auth pool.**
**Faza 2 — Layer 2 concurrency testovi (dostupni lokalno i iz GitHub UI-a).**
Faze 3 (k6), 4 (Playwright), 5 (report/CI) — svjesno stub.

## Preduvjeti (host stroj, ne Lovable sandbox)

- Docker
- **Supabase CLI ≥ 1.180 (`supabase --version`) — TVRDI ZAHTJEV.**
  `run-all.sh --smoke` odmah pada ako CLI nije na PATH-u. Ne postoji
  smisleni fallback jer nam za auth pool treba GoTrue + PostgREST.
- Node/Bun (za TS seed skripte)
- Min. resursi: 8 GB RAM, 4 core (za budući puni v1 volumen)

**Napomena**: Lovable sandbox nema Docker ni Supabase CLI. `run-all.sh
--smoke` mora se izvršiti lokalno na developer/CI stroju.

## Jedna naredba

```bash
bash stress/bin/run-all.sh --smoke
```

## Pokretanje iz GitHub UI-ja (bez lokalnog setupa)

Ako nemaš Docker / Supabase CLI / bash lokalno, stress run može se
pokrenuti kao GitHub Actions workflow:

1. GitHub repo → **Actions** → workflow **`stress-smoke`**
2. **Run workflow** (grana po izboru) → odaberi **layer**:
   - `smoke` (default) — Faza 1
   - `layer2` — Faza 2 Layer 2 concurrency
3. **Run**

Workflow radi točno ovo i ništa više:

- instalira Supabase CLI + Bun na `ubuntu-latest` (Docker već postoji)
- pokrene `supabase start`, pročita anon/service_role/DB URL iz
  `supabase status --output env` i upiše ih u `stress/.env`
- pokrene odabrani layer:
  - `smoke` → `bash stress/bin/run-all.sh --smoke`
  - `layer2` → `bash stress/bin/run-all.sh --layer=2`
- uploada `stress/reports/` kao artefakt

Nema `schedule`, nema `--full`, nema Faza 3/4/5. Trigger je isključivo
`workflow_dispatch`.


Flow:

1. `guard-env.sh` — tvrdo pada ako URL nije `localhost` / `127.0.0.1`
2. `supabase start` — digne lokalni stack (Postgres + GoTrue + PostgREST)
3. `reset-db.sh` — `supabase db reset --local` (CLI-only)
4. `pause-cron.sql` — snapshot + `UPDATE cron.job SET active = false`
5. `seed/seed.ts` — smoke seed (vidi "Seed volumen" niže)
6. `seed/loginSeedUsers.ts` ili `seed/tokens.ts` — auth pool → `stress/reports/tokens.json`
7. Ispis `READY`

Cleanup (uvijek, i na `trap ERR`):

- `resume-cron.sql` vraća original state iz `stress_cron_snapshot`
- `supabase stop` (osim ako `--keep-stack`)

## Auth strategija

`STRESS_AUTH_MODE` u `.env`:

- `login` (**default, robusnije**) — pravi `POST /auth/v1/token?grant_type=password`
  protiv lokalnog GoTrue-a. Sporije, ali imun na drift secreta.
- `mint` — mint-a JWT lokalno pomoću `GOTRUE_JWT_SECRET` iz environmenta.
  **Skripta sama NE poziva `supabase status --output env`.** Ti moraš
  exportati secret prije poziva, npr.:

  ```bash
  eval "$(supabase status --output env | grep GOTRUE_JWT_SECRET)"
  export GOTRUE_JWT_SECRET
  STRESS_AUTH_MODE=mint bash stress/bin/run-all.sh --smoke
  ```

  Ako `GOTRUE_JWT_SECRET` nije postavljen (ili je prekratak), `tokens.ts`
  pada s eksplicitnom porukom. Nema hardcodeanih fallbacka.

## Cron kontrola

Lokalni Supabase pokreće `pg_cron` schedulere. U stress runu **svi cron jobovi
se pauziraju** odmah nakon `db reset`, prije seeda:

- `pause-cron.sql` snima trenutno stanje u tablicu `stress_cron_snapshot`
  (auto-kreira ako ne postoji), zatim postavlja `cron.job.active = false` za sve.
- `resume-cron.sql` čita snapshot i vraća original `active` vrijednosti.

Sloj-2 testovi (Faza 2) provjeravaju `stress_active_cron_count()` prije
mjerenja — mora vratiti 0.

## Realtime — svjesno isključen

Za Fazu 1 se ne testira realtime. `docker-compose.stress.yml` je
prisutan kao **budući pomoćni artefakt**, ne kao aktivni fallback za
`run-all.sh`. Vidi napomenu niže.

## Seed volumen (ISTINITO, ono što kod stvarno radi)

- `--smoke`: **5 auth usera, 2 projekta (prva 2 usera), 2 expensa, 0 krugova.**
  Minimalno-ali-pošteno — dovoljno da se validira flow seed → login end-to-end.
- `--full`: **Faza 2 stub.** `run-all.sh --full` odmah pada. `seed/seed.ts`
  full grana kreira samo auth usere, bez domain redova. Puni domain seed
  (200 usera / 20 krugova / 30 projekata / 15k expenses) je posao Faze 2.

Ako ti trebaju krugovi ili veći volumen za concurrency testove — to nije
Faza 1.

## Guard: fail-closed na non-local URL

`guard-env.sh` provjerava `STRESS_SUPABASE_URL` (iz `.env`):

- Prihvaća samo `http://localhost:*` ili `http://127.0.0.1:*`
- Sve ostalo → `exit 1` s porukom `REFUSING TO RUN AGAINST NON-LOCAL URL`

## `docker-compose.stress.yml` — pomoćni artefakt

Postoji, ali **`run-all.sh` ga ne koristi**. Diže samo `postgres:16` —
bez GoTrue-a i PostgREST-a nije dovoljan za auth pool niti za realan
prikaz produkcijskog stacka. Držimo ga za buduće eksperimente
(npr. izolirani DB-only mikro-benchmark ili budući realtime profil).
**Nije validan fallback za Fazu 1.**

## Što NIJE u Fazi 1 / Layer 2

- Sloj 1 (k6)
- Sloj 3 (Playwright smoke)
- Report generator
- CI workflow proširenje
- Performance gate (v2 odluka, ne v1)
- Puni domain seed (200 usera / 20 krugova / 30 projekata / 15k expenses)
- `--full` runtime put

## Reprodukcija

```bash
cd stress
cp env.example .env
# uredi .env po potrebi (i pobrini se da Supabase CLI postoji)
bash bin/run-all.sh --smoke
```

<!-- sync-nudge: 2026-07-13T16:29:52Z -->

