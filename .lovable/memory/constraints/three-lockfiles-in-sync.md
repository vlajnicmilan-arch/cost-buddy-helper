---
name: bun.lock je jedini lockfile
description: Repo ima samo bun.lock; package-lock.json je obrisan i NIKAD se ne vraća, svi CI workflowi instaliraju bunom
type: constraint
---

Od 17.8.2026. repo ima **jedan jedini lockfile: `bun.lock`**.

Pravila:
1. `package-lock.json` je obrisan i **nikad se ne vraća** — ni ručno, ni alatom, ni kao nusprodukt `npm install`. Ako se pojavi, obriši ga.
2. Ne pokretati `npm install` / `npm ci` u ovom repou. Instalacija ide isključivo kroz `bun install` / `bun add` / `bun remove`.
3. Svi GitHub workflowi (`test.yml`, `e2e.yml`, `security-audit.yml`, `stress-smoke.yml`) koriste `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`.
4. `bun.lock` mora imati čiste `https://registry.npmjs.org/` URL-ove; sandbox proxy URL-ovi (`europe-west*-npm.pkg.dev/lovable-core-prod/...`) nisu dostupni s GitHub runnera.

**Why:** platforma sinkronizira samo `bun.lock` kod platformskih bumpova (npr. `@lovable.dev/vite-plugin-hmr-gate`). `package-lock.json` je zaostajao pri svakom bumpu i rušio `npm ci` s EUSAGE prije ijednog testa (runs #996–#999). Datoteka koju nitko ne održava mora nestati.
