Uzrok je potvrđen: `package.json` ima `@playwright/test` u `devDependencies`, ali `package-lock.json` nema odgovarajuće lock zapise za `@playwright/test`, `playwright`, `playwright-core` i `fsevents`. Zato `npm ci` u GitHub Actions prekida prije testova.

Plan:
1. Ažurirati samo `package-lock.json` iz postojećeg `package.json` stanja.
2. Ne mijenjati aplikacijski kod.
3. Ne mijenjati workflowe jer je CI konfiguracija ispravna: `npm ci` treba failati kad lockfile nije sinkroniziran.
4. Verificirati da lockfile sada sadrži Playwright pakete koje CI traži.
5. Po potrebi pokrenuti test naredbu nakon izmjene, ali očekivani blocker je riješen već sinkronizacijom lockfilea.

Tehnički:
- Najsigurniji zahvat je regenerirati lockfile lokalno iz `package.json` bez dodavanja novih dependencyja.
- Očekivana promjena: `package-lock.json` dobiva root `@playwright/test` entry i transitive pakete `playwright`, `playwright-core`, `fsevents`.