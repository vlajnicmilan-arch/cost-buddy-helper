# Layer 3 — Playwright E2E pod k6 loadom

**Cilj:** Dokazati da kritični UI tokovi (unos troška + saldo update, project + milestone create) prolaze kroz pravo React sučelje DOK k6 (small profile, 30 VU) tuče backend, uz bezuvjetni invariant sweep nakon.

**NIJE** duplikat postojećeg `e2e/` — ovo je fokusirana pod-suite s **lokalnim Supabase stackom** (nikad remote) i orchestracijom kroz `stress/bin/run-all.sh --layer=3`.

## Struktura

```
stress/layer3-e2e-under-load/
  playwright.config.ts        # Cilj: http://127.0.0.1:4173 (Vite preview), local Supabase (127.0.0.1:54321)
  global-setup.ts             # Kreira/resetira 2 test korisnika, persistira storageState
  helpers/
    env.ts                    # Čita STRESS_SUPABASE_* iz .env (guard-env potvrđuje lokalno)
    auth.ts                   # Login preko GoTrue password grant
    db.ts                     # Service-role admin klijent (samo lokalno)
  flows/
    01-manual-entry-under-load.spec.ts     # Unos troška + UI saldo skok
    02-project-milestone-under-load.spec.ts # Project create + milestone add
```

## Prod-izolacijski guard

`run-all.sh --layer=3`:
1. Prisiljava Vite build s **VITE_SUPABASE_URL=http://127.0.0.1:54321** i lokalnim anon key iz `stress/.env`.
2. GREP-a `dist/` za `fzalxjretvtvokiotvkf.supabase.co` (production project ref). Match = **ABORT**.
3. GREP-a `dist/` za `.supabase.co` općenito. Match = **ABORT** (nijedna remote instanca).

Bez ovog guarda sloj 3 se odbija pokrenuti.

## Exit contract (konzistentan sa slojem 1)

- `0` — sve zeleno (invariante PASS, Playwright PASS, k6 clean)
- `1` — invariant fail = **CRVENA ZONA** (istina prekršena)
- `2` — samo Playwright ili k6 threshold breach uz čiste invariante = **CI hardware ceiling**
