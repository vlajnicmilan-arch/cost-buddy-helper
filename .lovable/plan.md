## Faza 4 — Sigurnost, integritet i telemetrija update procesa

Nadogradnja na Fazu 1 (APK auto-update). Dodaje 4 zaštitna sloja + alate za debugiranje. Svi mehanizmi su backward-compatible — ako bilo koji novi check zakaže, postojeći flow nastavlja raditi.

---

### 1. SHA-256 checksum (anti-tampering)

**Što:** APK datoteka se nakon downloada provjerava kriptografski. Ako je oštećena tijekom skidanja ili netko ju je zamijenio (man-in-the-middle), instalacija se blokira.

**Kako:**
- `public/version.json` dobiva polje `sha256` (npr. `"a3f2c1d4..."`)
- `apkInstaller.ts` (iz Faze 1) nakon downloada izračuna SHA-256 hash i usporedi
- Ako se ne podudara → datoteka se briše, korisnik dobije lokaliziranu poruku, telemetrija zapiše `update_checksum_failed`
- Ako `sha256` polje **ne postoji** u `version.json` (legacy) → check se preskače (nema regresije)

---

### 2. `minSupportedVersion` kill-switch

**Što:** Mehanizam za prisilni update postoji u kodu, ali je default **uspavan** (`0.0.0` = nikad forsirano). Aktivira se samo ako u budućnosti pukne nešto kritično (security, data corruption).

**Kako:**
- `version.json` dobiva polje `minSupportedVersion` (default `"0.0.0"`)
- `useAppUpdateChecker` uspoređuje instaliranu verziju s `minSupportedVersion`
- Ako je instalirana verzija starija → dialog dobiva `forced: true` prop
- `UpdateAvailableDialog` u `forced` modu **sakriva "Kasnije" gumb** i blokira zatvaranje
- Ako polje nedostaje → tretira se kao `0.0.0`

---

### 3. Update telemetrija (10 eventa)

**Što:** Anonimne evidencije procesa updatea u postojećoj `app_diagnostics_logs` tablici. Bez ovoga ne znaš zašto Petru ne radi update.

**Eventi:**
1. `update_check_performed` — provjera završena (s rezultatom: novo / staro / error)
2. `update_dialog_shown` — dialog prikazan korisniku
3. `update_user_accepted` — kliknuo "Ažuriraj"
4. `update_user_declined` — kliknuo "Kasnije"
5. `update_download_started` — počeo download APK-a
6. `update_download_completed` — APK uspješno skinut
7. `update_download_failed` — download pao (s razlogom)
8. `update_checksum_failed` — SHA-256 mismatch
9. `update_install_intent_launched` — Android instalacijski ekran otvoren
10. `update_install_completed` — pri sljedećem bootu se detektira nova verzija

**Kako:** Helper `logUpdateEvent(event, metadata)` u `src/lib/updateTelemetry.ts`, sve omotano u `try/catch` da telemetrija nikad ne ruši update flow.

---

### 4. KEYSTORE_BACKUP.md (operativna dokumentacija)

**Što:** Markdown dokument u root-u projekta koji sadrži:
- Lokaciju keystore-a (`C:\Users\vlajn\.android\debug.keystore`)
- Default vrijednosti (alias, password)
- Backup checklistu (USB / password manager / cloud)
- Procedura što napraviti ako se izgubi (migracija svih korisnika)
- SHA-1 fingerprint za verifikaciju (komanda za izvući)

**Bez koda — čista dokumentacija za tebe.**

---

### 5. Auto-bump skripta

**Što:** Jedna komanda umjesto ručnog ažuriranja 3 datoteke + ručnog računanja SHA-256.

**Kako:** `scripts/bump-version.mjs`:
```
node scripts/bump-version.mjs 1.3.0
```
Skripta automatski:
- Ažurira `public/version.json` (version + sha256 + zadržava `minSupportedVersion`)
- Ažurira `src/lib/version.ts` (`APP_VERSION`)
- Ažurira `android/app/build.gradle` (`versionCode` + `versionName`)
- Računa SHA-256 ako APK postoji u `dist/` ili pita za putanju

---

### Datoteke koje se kreiraju / mijenjaju

**Nove:**
- `src/lib/updateTelemetry.ts` — helper za 10 eventa
- `scripts/bump-version.mjs` — auto-bump skripta
- `KEYSTORE_BACKUP.md` — dokumentacija

**Mijenja se (iz Faze 1):**
- `public/version.json` — dodaje `sha256` i `minSupportedVersion`
- `src/components/update/updateUtils.ts` — `VersionCheckResult` dobiva `sha256` i `minSupportedVersion`
- `src/components/update/apkInstaller.ts` — SHA-256 verifikacija nakon downloada
- `src/components/update/UpdateAvailableDialog.tsx` — `forced` prop
- `src/components/update/useAppUpdateChecker.ts` — provjera `minSupportedVersion` + telemetrija
- `src/i18n/locales/{hr,en,de}.json` — `errors.appUpdate.checksumFailed`, `errors.appUpdate.forcedUpdate`

---

### Defenzivna načela

- Sve nove provjere imaju fallback — ako SHA-256 izračun pukne, app nastavlja raditi (samo blokira tu instalaciju)
- Telemetrija je **fire-and-forget** u `try/catch` — nikad ne ruši update
- `minSupportedVersion` default `0.0.0` znači mehanizam je "uspavan" dok ga svjesno ne aktiviraš za hitnoću
- Sve nove poruke ide preko i18n (`errors.appUpdate.*` namespace)
- Backward compatible: ako `version.json` ima samo `version` (kao danas), sve i dalje radi

---

### Procjena trajanja

~2h ukupno. Faza 1 (~6h) + Faza 4 (~2h) = ~8h.
