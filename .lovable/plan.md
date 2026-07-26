## Procjena opsega (skeniranje, bez izmjena)

### Brojevi

**Rizična klasa #1: REVOKE/GRANT EXECUTE ON FUNCTION**
- Ukupno naredbi: **336** (196 REVOKE + 140 GRANT)
- Broj migracijskih datoteka: **43**
- Već zaštićeno `to_regproc(edure)` guardom: **1** (od 336)
- Golo (potencijalno rizično u from-scratch replayu): **335**

**Top 4 datoteke (Faze 1/2a/3 od 25.7.):**
```
20260725044309   34 naredbi   ← ovdje puknuo posljednji run (statement 17: is_budget_member)
20260725051425   30
20260725052449   26
20260725044733   11
                ---
                101 naredbi u 4 datoteke (30% ukupnog rizika)
```

Preostalih ~235 naredbi je razasuto po 39 starijih datoteka (1–7 naredbi po datoteci).

**Rizična klasa #2: ostali DDL bez `IF EXISTS`**
- `DROP FUNCTION` bez IF EXISTS: **0** (svih 27 već koristi IF EXISTS)
- `DROP TRIGGER` bez IF EXISTS: **0** (jedini pogodak je već zaštićena migracija auth.users)
- `DROP TABLE` bez IF EXISTS: **4** — sve su ili temp tablice unutar CTE bloka (`_fp_candidates`, `_all_fp`, `_to_delete`) ili `ALTER PUBLICATION ... DROP TABLE` (drugačija semantika). **Sve benigne, ne pucaju.**
- `DROP POLICY` bez IF EXISTS: **0**
- `ALTER TABLE ... DROP COLUMN` bez IF EXISTS: **0**

### Koliko će STVARNO puknuti?

Ne znam točan broj bez replaya. Znam samo:
- Sigurno puca barem jedan (`is_budget_member(uuid, uuid)` u `20260725044309`, statement 17).
- Preostalih 334 golih naredbi je **kandidati** — puknu samo one gdje ciljana funkcija ne postoji u tom trenutku lanca. Faze od 25.7. su najsumnjivije jer po strukturi ciljaju veliki broj legacy funkcija odjednom, a neki potpisi su vjerojatno drift-ali kroz historiju.
- Realna procjena: reda veličine **10–40 stvarnih pucanja** rasporeñenih kroz lanac (svaki pop-out zaustavi bootstrap i otkriva sljedeći).

### Mehanika popravka

**Jedan pattern, uniforman.** Svaki `REVOKE/GRANT EXECUTE ON FUNCTION public.f(args) FROM/TO role` se omota:

```sql
DO $$ BEGIN
  IF to_regprocedure('public.f(args)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.f(args) FROM anon, PUBLIC';
  END IF;
END $$;
```

Nema raznolikih slučajeva — 335 naredbi = 335 identičnih omota. Producijska semantika ostaje ista (funkcije koje postoje se revoke-aju kako i sad; nepostojeće se preskoče umjesto RAISE).

### Procjena posla

| Pristup | Trud | Rizik |
|---|---|---|
| **A. Skriptirano omotavanje svih 335** (regex/AST transform + verifikacija diff-a + jedan commit po datoteci ili jedan veliki) | **2–4 h** rada + 30 min review | Nizak — mehanički pattern, produkcija ne mari (funkcije koje trenutno postoje se i dalje revoke-aju) |
| **B. Krtica** (popravljaj jedan po jedan kad bootstrap padne) | 15 min × N pucanja, N nepoznat (10–40?) = **2–10 h** rastegnuto kroz dane, s CI cikluslusom po svakom | Isti krajnji rezultat, sporije, više commitova |
| **C. Whitelist Faze 25.7. u stress bootstrapu** | 30 min | Ne rješava klasu; skriva ju. Ne testiramo REVOKE putanju u stress harness-u. |

### Zaključak (bez preporuke)

- Opseg je **velik po broju** (335 naredbi, 43 datoteke) ali **uzak po vrsti** (jedan mehanički pattern).
- Nije "sat posla" ali nije ni tjedan. Skriptirano: pola dana rada + jedan review + jedan commit.
- Krtica-pristup traje isto ili duže, s više commitova i više CI runova.
- Whitelist nije rješenje klase, samo odgoda.

Milan odlučuje smjer (A / B / C / drugo).
