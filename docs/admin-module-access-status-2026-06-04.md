# Admin Module Access — Status PR1 + PR2 + PR3

**Datum zaključavanja:** 2026-06-04
**Status:** PR1, PR2 i PR3 završeni
**Sljedeća faza:** daljnje promjene = novi scope

---

## 1. Svrha

Ovaj dokument služi kao referentna točka koja zaključava završeno stanje admin module access refactora (PR1). Potvrđuje da je legacy `Free / Pro / Business` jezik uklonjen iz admin sučelja i da admin UX sada radi po novom modelu izgrađenom oko `Core`-a, modula, izvora pristupa i efektivnog pristupa.

Dokument NE opisuje implementacijske detalje na razini koda — služi kao formalni "PR1 closed" zapis za projekt.

---

## 2. Zaključano stanje

- Legacy nazivi `Free`, `Pro` i `Business` više se ne pojavljuju kao jezik admin sučelja.
- Admin UX organiziran je oko četiri pojma:
  - **Core** — osnovni plan koji ima svaki korisnik
  - **Moduli** — `Projects`, `Business` (i kasnije `Family`)
  - **Izvor pristupa** — `Naplata` ili `Override`
  - **Efektivni pristup** — unija izvora po korisniku
- DB enum `user_subscriptions.tier` ostaje interni izvor istine i nije promijenjen; UI ga samo prevodi u novi copy.

---

## 3. Što je implementirano

### Tab `Pristup`
Zamjena za stari tab `Pretplate`. Sadrži tri sekcije sljedećim redom:

1. **Naplata sustava** — globalni toggle naplate.
2. **Stanje pristupa po modulima** — tri kartice (`Core`, `Projects`, `Business`) gdje je `Ukupno s pristupom` primarni broj, a `kroz Naplatu` / `kroz Override` / presjek su sekundarni kontekst. Brojevi su namjerno nedisjunktni.
3. **Nedavna override aktivnost** — read-only feed sortiran po stvarnom vremenu događaja.

### Korisnički redak
- Tekstualni `Modul · Izvor` badgevi prikazani su samo za module gdje korisnik ima pristup.
- `Core` se ne prikazuje kao badge u retku.
- Kad korisnik nema nijedan modul, prikazuje se indikator `Samo Core`.

### Detalj korisnika
Inline sekcije unutar `UsersTab` u sljedećem redoslijedu:

1. **Efektivni pristup** — summary po modulima i izvorima.
2. **Naplata** — sloj 1, per-user billing kontrola.
3. **Admin override modula** — sloj 2, dodjela i opoziv override grantova s historijom.

Između slojeva prikazan je neutralan info-callout koji objašnjava da su naplata i override nezavisni izvori.

### Helperi (pure, pokriveni testovima)
- `formatBillingPlanLabel`
- `deriveEffectiveAccess`
- `summarizeModuleAccess`
- `sortGrantsByLatestEvent`

### Lokalizacija
Svi novi ključevi pokriveni su za sva tri jezika:
- HR: `Naplata:`
- EN: `Billing:`
- DE: `Abrechnung:`

### Testovi
28 Vitest test slučajeva u `src/lib/__tests__/adminAccess.test.ts` koji pokrivaju label mapping, derivaciju efektivnog pristupa, summary brojanje (uključujući presjek i UNION) i deterministički sort.

---

## 4. Što je verificirano

- **Grant** — dodjela override granta radi (kreiranje, prikaz u listi, history zapis).
- **Revoke** — soft-revoke i auto-supersede expired grantova rade.
- **Prikaz i navigacija** u `/admin` rade: tab `Pristup`, korisnički redak, detalj korisnika sa sve tri inline sekcije (`Efektivni pristup`, `Naplata`, `Admin override modula`).
- **Build** prolazi (`tsc --noEmit` bez grešaka).
- **Testovi** prolaze (28/28 u `adminAccess.test.ts`).

---

## 5. Što nije dirano

- DB enum `user_subscriptions.tier` — netaknut.
- Postojeći backend access model (`admin_module_grants`, RPC-ovi, RLS) — netaknut.
- `Family` modul — nije aktiviran u admin override modelu.
- Sve funkcionalnosti izvan PR1 scope-a — netaknute.

---

## 6. Out of scope / PR2

Sljedeće stavke svjesno su odgođene za sljedeći scope i NE smatraju se nastavkom PR1:

- Filter `Override ističe < 7d`
- Filter `Plaća` / `Ne plaća`
- Drill-down liste iz kartica modula
- Bulk override dodjela
- Aktivacija `Family` modula u admin override modelu

---

## 7. Zaključak

Admin module access PR1 je **završen** i zaključan u ovom stanju. Refactor je postavio čist temelj na kojem se može graditi PR2.

Daljnje promjene admin access UX-a trebaju ići kao **novi scope** s vlastitim planom i vlastitim status dokumentom — ne kao nastavak ovog PR-a. Time se izbjegava ponovno otvaranje već zaključanih odluka oko jezika sučelja, redoslijeda sekcija i semantike brojanja.

---

## 8. PR2 nadogradnja (završeno)

Uzak PR2 scope zatvoren u istom dokumentu radi povijesnog konteksta:

1. **Drill-down iz kartica modula** — 3 brojača na `ModuleAccessOverview` (Total / Naplata / Override) emitiraju `onDrilldown` u `Admin.tsx` (`pendingUserContext`), prebacuju na `Pristup → Korisnici` tab i predaju `activeContext` u `UsersTab`.
2. **Vizualno odvojen kontekst chip** — `activeContext` je zaseban drill-down state (nije pod `sourceSubFilter`), prikazan kao primary chip s prefiksom `Iz kartice modula:` i `×` resetom. Šest eksplicitnih varijanti: `Projects`, `Projects kroz Naplatu`, `Projects kroz Override`, `Business`, `Business kroz Naplatu`, `Business kroz Override`.
3. **Filter `Override ističe < 7d`** — strict rolling `expires_at − now < 7×24h`, isključuje perpetual i revoked grantove; sortiranje po `min(expires_at) ASC`.
4. **Tekstualni expiry badge** — `formatExpiryBadge(expiresAt, now)` deterministički 4-bucket mapping (`Ističe uskoro` / `Ističe danas` / `Ističe za 1 dan` / `Ističe za N dana`), bez decimala, neutralno-amber stil; zamijenio postojeću `Clock3` ikonu u `UserAccessBadges`.
5. **Helperi** — `hoursUntilGrantExpiry`, `isGrantExpiringSoon`, `getEarliestUpcomingExpiry`, `formatExpiryBadge` u `src/lib/adminAccess.ts`, pokriveni vitest setom (53 testa prolaze).
6. **i18n** — novi ključevi u HR/EN/DE za `admin.users.filter.expiringOverride`, `admin.users.expiry.*` (s pluralizacijom), `admin.users.activeContext.*`.

Out of scope (potvrđeno): bez DB promjena, bez RPC-ova, bez edge funkcija, bez telemetryja/funnel evenata, bez `Plaća/Ne plaća`, bez bulk overridea, bez `Family` aktivacije, prag fiksan na 7 dana.

**PR2 zatvoren.**

---

## 9. PR3 nadogradnja (završeno)

Uzak PR3 scope zatvoren u istom dokumentu radi povijesnog konteksta. Pravilo zaključano prije implementacije: **`Override` znači isključivo ručnu admin iznimku i nikada se ne smije miješati s `Billing` ni u jednom brojaču, filteru ili kontekstu.**

### Što je pokriveno

1. **Override reason breakdown** — inline ispod `Override` retka na svakoj kartici modula u `ModuleAccessOverview`. Prikazuju se samo razlozi s count `> 0`; ako su svi `0`, breakdown se ne renderira. Brojanje ide preko `groupActiveGrantsByReason(grants, module)` koji u potpunosti ignorira billing.
2. **Drill-down po reasonu** — klik na reason chip postavlja `activeContext = { module, source: 'override', reasonCode }` i prebacuje na `Korisnici` tab. Filtriranje koristi `filterGrantsByReason(grants, module, reasonCode, now)` s **obaveznim** `module` parametrom kao prvim diskriminatorom — nema cross-module curenja.
3. **Context chip s trećom dimenzijom** — `Modul · Override · Razlog` (npr. `Projects · Override · Beta tester`). `[×]` briše cijeli kontekst (sve tri dimenzije). Sekundarni UX detalj: drugi klik na isti reason chip briše samo treću dimenziju, dok `module` i `source` ostaju.
4. **Čisti override-only model** — `reasonCode` je validan ISKLJUČIVO uz `source: 'override'`. `EffectiveAccessSummary` i billing sloj nedirani. `GrantReasonCode` premješten u `src/lib/adminAccess.ts` kao domain tip; `useAdminModuleGrants.ts` ga importira odatle (obrnut smjer od ranijeg).

### Status

- **Implementirano** — `src/lib/adminAccess.ts`, `src/hooks/useAdminModuleGrants.ts`, `src/components/admin/AccessTab.tsx`, `src/components/admin/UsersTab.tsx`, `src/components/admin/access/ModuleAccessOverview.tsx`.
- **Testirano** — 12 novih vitest slučajeva u `src/lib/__tests__/adminAccess.test.ts` (per-module izolacija, reason normalizacija); ukupno **554 testa prolaze**.
- **Ručno verificirano** — breakdown se skriva kad nema aktivnih override grantova; klik na reason chip ispravno filtrira `UsersTab`; context chip pokazuje sve tri dimenzije; `[×]` resetira cijeli kontekst; `EffectiveAccessSummary` nepromijenjen.

### Out of scope (potvrđeno i dalje)

- Bulk override dodjela
- `Family` modul (aktivacija u admin override modelu)
- Audit CSV export po reasonu
- Cron / auto-revoke / notify za istekle grantove
- Server-side `is_business_subscriber()` + Business RLS

**PR3 zatvoren.**

---

## 10. Završni zaključak

- **PR1** — završen (refactor admin UX-a, uklonjen legacy `Free/Pro/Business` jezik, helperi i testovi).
- **PR2** — završen (drill-down iz kartica, kontekst chip, filter `Override ističe < 7d`, tekstualni expiry badge).
- **PR3** — završen (override reason breakdown, drill-down po reasonu, treća dimenzija konteksta, čisti override-only model).

Stanje admin module access UX-a je **zaključano**. Bilo kakva daljnja promjena (bulk override, `Family`, CSV export, auto-revoke, Business RLS, server-side subscriber check, dodatne dimenzije konteksta) tretira se kao **novi scope** s vlastitim planom i vlastitim status zapisom.

