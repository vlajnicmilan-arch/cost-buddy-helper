
# Zaštita od AI cost abusea — 4 sloja

Cilj: spriječiti da netko skriptom ispuca Lovable AI kredite nakon javnog launcha.

## Korak 1 — Workspace budget cap (ti, ručno, 2 min)

**Nakon što završim kod**, otvori u Lovable:
Workspace → Usage → **Set monthly budget**

Predlažem: **20€/mjesec** za početak (možeš dignuti kasnije).
Kad se dosegne, gateway vraća 402 i sve AI funkcije staju — hard stop.

To je jedina stvar koju **ja ne mogu** napraviti iz koda.

## Korak 2 — JWT auth na 5 anonimnih AI ruta

Trenutno bilo tko s anon ključem (koji je javan) može pozvati:
- `categorize-transaction`
- `detect-loans`
- `match-recurring`
- `parse-standup`
- `scan-card`

**Fix:** dodam `verify_jwt = true` u `supabase/config.toml` za svaku + provjeru tokena u kodu (kao što već imaju `parse-receipt`, `financial-assistant`, itd).

Rezultat: anonimni napadač više ne može pozvati ništa. Mora se prvo registrirati.

## Korak 3 — Per-user dnevni counter (`ai_usage_daily`)

Nova tablica:
```
ai_usage_daily (user_id, date, route, count)
PRIMARY KEY (user_id, date, route)
```

Helper edge function `check-ai-quota(route)` koji:
1. Učita user tier (free/pro/business)
2. Provjeri count za danas
3. Ako > limit → vrati 429 s porukom "Dnevni limit dostignut"
4. Inače increment + dopusti

**Limiti (prijedlog):**
| Ruta | Free | Pro | Business |
|---|---|---|---|
| `parse-receipt` | 10/dan | 100/dan | 500/dan |
| `parse-pdf-statement` | 3/dan | 30/dan | 150/dan |
| `financial-assistant` | 5/dan | 50/dan | 200/dan |
| `generate-ai-insights` | 1/dan | 1/dan | 1/dan (već cached) |
| `scan-card` | 5/dan | 20/dan | 50/dan |
| `analyze-document` | 5/dan | 30/dan | 100/dan |

(Mogu se podešavati kasnije bez deploya — držat ću ih u JS konstanti.)

Pozove se na početku svake skupe AI rute. Ako vrati 429, UI prikaže poruku.

## Korak 4 — Feature gating za `ai_assistant`

`useFreeLimits` već ima koncept feature flagova, ali `financial-assistant` i `generate-ai-insights` ne provjeravaju tier.

**Fix:** edge funkcije čitaju `subscriptions` tablicu po `user_id` i ako je `tier='free'`, primjenjuju strogi limit (ili blokiraju potpuno za `ai_assistant`).

Free useri → ne mogu uopće u financial-assistant chat (već po postojećoj logici, samo treba potvrditi i staviti gate u edge).
Free useri → 1 AI insight dnevno (već cached, manji rizik).

## Tehničke izmjene (sažeto)

- **Migracija:** nova tablica `ai_usage_daily` + RLS (user sam svoj) + GRANTs.
- **Nova edge funkcija:** `_shared/check-ai-quota.ts` helper (importan iz drugih funkcija).
- **5 edge funkcija dobiva JWT verifikaciju** (`getClaims` pattern).
- **6 edge funkcija dobiva quota check** na početku.
- **`supabase/config.toml`** — `verify_jwt = true` za 5 ruta.
- **i18n ključevi** za "dnevni limit" poruku (HR/EN/DE).
- **UI:** lagana poruka u relevantnim screenovima kad backend vrati 429 (već imamo `errors.*` strukturu).

## Što NE radim

- Ne diram email verifikaciju (već postoji u kodu, već je u tvom Lovable Cloud setupu).
- Ne diram `useFreeLimits` za transakcije/origins/budgete (radi savršeno).
- Ne dodajem rate limit na requeste per sekunda (sustavna preporuka kaže preskočiti).

## Rezultat

Napadač sa skriptom:
1. Bez logiranja → 401 (blokirano korakom 2)
2. S free accountom → max ~30 AI poziva/dan ukupno → ~0.01€ trošak
3. S Pro accountom (platio 5€) → max ~230 poziva/dan → ~0.20€/dan trošak (još uvijek profitabilno)
4. Ako bilo što pukne → workspace cap 20€ je hard stop (korak 1)

Reci "krenimo" pa prelazim u build mode.
