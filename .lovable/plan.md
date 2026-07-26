# Stanje

Run 30212214458 (job 89820253788, head sha `782df07`) je pao na **korak 3 "Install Supabase CLI"** s greškom:

```
##[error]Failed to resolve latest Supabase CLI release: rate limit exceeded
```

Koraci "Start Supabase with cron extension bootstrap", "Run stress harness" i sve ostalo iza toga su `skipped`. PHASE 5 nikad nije startao, pa dinamični diag A (iz commita `782df07`) nije imao priliku pokazati je li ispravno detektirao `20260722223736`.

Ovo je infrastrukturna greška CI-a, **ne kvar migracije**. `supabase/setup-cli@v1` s `version: latest` poziva `api.github.com/repos/supabase/cli/releases/latest` bez auth headera i pao je na anonimni rate limit (60/h po runner IP-u).

# Što se NIJE saznalo

- Pravi SQLSTATE za `20260722223736`
- Točna naredba koja puca (DROP TRIGGER na `auth.users`, CREATE FUNCTION `activate_module_trial`, REVOKE/GRANT, ili nešto četvrto)
- DETAIL/HINT/LINE
- Je li novi dinamični diag A uopće ispravno parsirao `phase5-migration-up.log`

# Opcije za sljedeći korak (Milan bira)

## Opcija 1 — Prazan rerun (najbrže, 0 promjena)
Milan ručno klikne "Re-run failed jobs" na runu 30212214458. Ako je runner dobio drugu IP adresu, rate limit se ne aktivira i diag A se izvrši. Rizik: isti IP → ista greška. Nema kod izmjena, nema odobrenja izvan opsega.

## Opcija 2 — Zaključati verziju Supabase CLI (jedna izmjena workflowa)
U `.github/workflows/stress-smoke.yml` promijeniti:
```yaml
- uses: supabase/setup-cli@v1
  with:
    version: latest
```
u fiksnu verziju (npr. `version: 2.15.0` — provjerit ću stvarnu zadnju stabilnu prije commita). Fiksna verzija preskače `releases/latest` API poziv → nema rate limita. Trajno rješenje. Zahtijeva Milanov OK za izmjenu workflowa.

## Opcija 3 — Proslijediti GitHub token setup-cli akciji
Dodati `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` env varijablu na taj korak. Autentificirani API pozivi imaju limit 1000/h, ne 60/h. Također trajno rješenje, ali samo ako `setup-cli@v1` čita `GITHUB_TOKEN` iz env — treba potvrditi čitanjem source koda akcije prije commita.

# Preporuka za redoslijed

1. Milan pokreće **Opciju 1** ručno (0 rizika, 0 odobrenja).
2. Ako opet padne s rate limitom → Milan odobrava **Opciju 2 ili 3**.
3. Kad diag A napokon prođe → dobijemo pravi SQLSTATE za `20260722223736` i tek onda planiramo popravak same migracije.

# Ovlasti

Ovaj plan **ne** sadrži izmjenu migracije `20260722223736` niti bilo koje druge. Sve tri opcije čekaju eksplicitno Milanovo odobrenje prije bilo kakvog commita. Opcija 1 uopće ne zahtijeva agenta.
