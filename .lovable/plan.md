# Nalaz: objava ne leže — kod nije uzrok

Ne mijenjam kod, konfiguraciju ni bazu. Ovo je samo nalaz i odgovori na šest pitanja.

## 1. Build log

Poslao sam internim kanalom pun sažetak s tvojom reprodukcijom (javni repo, HEAD `b302b59`,
npm i bun, `tsc -b`, sve exit 0, identični nazivi chunkova) i izričito zatražio zapis o
pokušajima objave 5.–6.8. za ovaj projekt.

**Ja sam nemam alat koji čita build/deploy log niti stanje pipelinea.** Alat za objavu vraća
samo „scheduled/failed" bez ijednog detalja. To je i formalno prijavljeno kao nedostatak.
Dok tim ne odgovori, log ostaje jedina rupa u dokazima.

## 2. Čime platforma gradi

Nemam potvrdu iznutra. Ono što se u repozitoriju vidi:

- `package.json` → `"build": "vite build"`
- Sandbox u kojem radim: Node `v22.22.0`, Bun `1.3.3`

Je li produkcijski graditelj isti alat i ista verzija — **ne znam**, pitanje je poslano.

## 3. Env varijable pri buildu

U repou je `.env` s tri `VITE_SUPABASE_*` varijable i `vite.config.ts` čita
`public/version.json`. Tvoj build je prošao samo s tim. Traži li platforma ijednu dodatnu
varijablu — **nemam uvid**, pitanje je poslano.

## 4. Lovable-specifično u buildu

Jedna stvarna razlika u odnosu na čisti build postoji i vrijedi je istaknuti podršci:

- `vite.config.ts` uključuje `mcpPlugin()` iz `@lovable.dev/mcp-js/stacks/supabase/vite`
- postoji `.lovable/mcp/manifest.json` koji se regenerira na svaki commit
- postoje `.lovable/memory`, `.lovable/audits`, `.lovable/plan.md`

Kod tebe je `mcpPlugin()` prošao (isti `vite.config.ts`), pa sam plugin nije osumnjičen.
Ali ekstraktor manifesta koji platforma vrti uz commit **guta greške tiho** — to je jedini
korak u lancu koji postoji kod njih, a ne kod tebe.

## 5. Što „error in your app" znači

Nemam pristup mapiranju te poruke. Empirijski: prvi put je bila vezana uz sigurnosni nalaz
`SUPA_security_definer_view` (dakle **ne** build), a kasniji pokušaji su javljali uspjeh i
svejedno nisu legli. To jako sugerira **općenit tekst za bilo kakav kvar u lancu**, ne
specifičnu grešku prevoditelja. Traženo je potvrditi.

## 6. Zaključano / pauzirano stanje hostinga

Ne mogu pročitati stanje deploymenta. Jedini vidljivi trag:
`x-deployment-id: 1a7dd7c0-c4b8-4ef1-91b8-7086b2323d3f` nepromijenjen kroz sve pokušaje —
što je konzistentno sa zaustavljenim ili zaključanim pipelineom. Pitanje je poslano.

## Što je poslano podršci

- Javni repo + `git clone` → `bun install --frozen-lockfile` → `bun run build` → exit 0 (~50 s)
- Isto s `npm ci` + `npx vite build`, plus `tsc -b` i `tsc --noEmit -p tsconfig.app.json`
- Usporedba: moj entry `index-WiTlUQSD.js` sadrži „Povijest je dopunjena" i nema
  `billing_enabled`; produkcija poslužuje `index-DM1jJWs-.js` s obrnutim sadržajem
- 31 commit zaostatka, `x-deployment-id` nepromijenjen, HTML se poslužuje s `no-cache`

## Sljedeći korak

Čekamo odgovor. Ne pokrećem objavu, ne diram kod. Kad stigne log, provjera ide istom
metodom: rekurzivno skidanje chunkova s produkcije i traženje markera
„Povijest je dopunjena" te odsutnosti `billing_enabled`.
