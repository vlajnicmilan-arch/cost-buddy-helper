---
name: Sva tri lock-a u istom commitu
description: Svaki bump ovisnosti mora uskladiti package.json + bun.lock + package-lock.json u istom commitu, inače npm ci u CI-ju pada
type: constraint
---

Repo ima DVA install puta: `bun` (agent/sandbox) i `npm ci --legacy-peer-deps` (GitHub Actions `test.yml`).

Pravilo: svaka promjena ovisnosti — uključujući platformske bumpove (npr. `@lovable.dev/vite-plugin-hmr-gate`) — MORA u ISTOM commitu ažurirati:
1. `package.json`
2. `bun.lock`
3. `package-lock.json`

Regeneracija: `npm install --package-lock-only --legacy-peer-deps`.

**Dodatno**: sandbox npm resolvira preko internog proxyja (`europe-west*-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`). Takvi `resolved` URL-ovi su nedostupni s GitHub runnera — nakon regeneracije obavezno prepiši ih natrag na `https://registry.npmjs.org/`:

```sh
sed -i 's#https://europe-west[0-9]-npm\.pkg\.dev/lovable-core-prod/sandbox-npm-cache/#https://registry.npmjs.org/#g' package-lock.json
```

Provjera prije završetka: `npm ci --dry-run --legacy-peer-deps` mora proći bez `EUSAGE` greške.

**Why:** raskorak lock-ova ruši CI prije ijednog testa (mail "vitest CI crven" iako su testovi zeleni). Ista klasa kvara kao srpanjski APK/CI incident.
