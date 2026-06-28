# Admin Hard Delete Entrypoint — Implementation Plan

Scope je zaključan. Foundation (`purgeUser` engine, `tablesToPurge`, residual scan, `process-pending-deletions` refaktor) ostaje netaknut.

## 1. Nova edge funkcija `admin-hard-delete-user`

Lokacija: `supabase/functions/admin-hard-delete-user/index.ts`

Tok (fail-fast, redom):

1. CORS preflight handler.
2. **JWT check** preko `supabase.auth.getClaims(token)` — 401 ako nema/loš.
3. **Admin role check** preko `has_role(auth.uid(), 'admin')` (service-role klijent) — 403 ako nije admin.
4. **Env gate**: `Deno.env.get('ALLOW_HARD_DELETE') === 'true'` — 403 inače. Log u `app_diagnostics_logs` s `level='warning'`.
5. **Zod schema**: `{ userId: string().uuid(), email: string().email() }`. Bez array-a, bez bulk-a. 400 na invalid.
6. **Allowlist check** (eksplicitno):
   ```ts
   const ALLOWLIST_EMAILS = ['vinkabalance@gmail.com'];
   const ALLOWLIST_DOMAIN_SUFFIX = '@test.vmbalance.com';
   const isAllowed = ALLOWLIST_EMAILS.includes(email.toLowerCase())
     || email.toLowerCase().endsWith(ALLOWLIST_DOMAIN_SUFFIX);
   ```
   403 + audit log ako nije.
7. **Dual-confirmation lookup**: `auth.admin.getUserById(userId)`; ako `user.email !== email` (case-insensitive) → 409.
8. **Pre-audit zapis** u `account_deletion_log`: `source='admin_hard_delete'`, `requested_by=<admin uid>`, `target_user_id`, `target_email`, `status='started'`.
9. **Poziv `purgeUser`** s policy:
   ```ts
   { sourceTag: 'admin_hard_delete', allowKrugDestruction: true, deletePaidRecords: true }
   ```
10. **Post-audit update**: rezultat (`deleted` | `blocked` | `failed`), residual scan summary, error string ako postoji.
11. Response: `{ status, blockedBy?, residualTables?: string[] }` + odgovarajući HTTP code.

Bez funkcijskog overridea u `config.toml` (default `verify_jwt = false`, validacija u kodu).

## 2. Environment gate

Secret: `ALLOW_HARD_DELETE` (runtime secret, ne build secret).
- Postavlja se preko `add_secret` tijekom builda.
- Vrijednost: `'true'` za uključeno, bilo što drugo / nepostavljeno = isključeno.
- Bez deploya može se ugasiti brisanjem ili promjenom vrijednosti.

## 3. Allowlist

Hardcoded u funkciji (jedan source of truth, server autoritativan):

```ts
const ALLOWLIST_EMAILS = ['vinkabalance@gmail.com'] as const;
const ALLOWLIST_DOMAIN_SUFFIX = '@test.vmbalance.com';
```

Nema regex-a za Gmail aliase. Nema generičkih `+test` patterna. Za proširenje — edit u kodu i novi deploy (namjerno trenje).

## 4. Admin panel UI (minimalno)

Trenutna admin Users sekcija: pronaći postojeću tablicu/listu (`src/components/admin/...` user-management komponentu) i dodati:

- **Dropdown item** "Hard delete (test only)" — disabled (sa tooltipom "Nije u allowlisti") ako email nije u frontend mirror allowlisti. Server ostaje autoritativan.
- **`HardDeleteUserDialog`** (`src/components/admin/HardDeleteUserDialog.tsx`):
  - Naslov + opis (crveni alert ton): "Trajno briše korisnika i sve podatke. Nije reverzibilno."
  - Prikazuje `userId` (read-only) i `email` (read-only).
  - Input "Utipkaj točan email za potvrdu" — gumb **disabled** dok se ne podudara case-insensitive.
  - Action gumb: "Trajno obriši" (destructive).
  - Na klik: `supabase.functions.invoke('admin-hard-delete-user', { body: { userId, email } })`.
  - Toast s rezultatom (preko `StatusFeedback`):
    - `deleted` → success
    - `blocked: krug_multi_member` → warning s porukom da treba ručno raspustiti krug
    - `failed` / non-200 → error
  - Sve stringove preko `t()`, ključevi u `admin.hardDelete.*` (hr/en/de).
- Bez novih ruta, bez novih tabova.

## 5. i18n

Novi ključevi u `src/i18n/locales/{hr,en,de}.json` pod `admin.hardDelete`:
`menuLabel`, `dialogTitle`, `dialogWarning`, `confirmInputLabel`, `confirmCta`, `cancel`, `successToast`, `blockedKrugToast`, `errorToast`, `notInAllowlistTooltip`.

## 6. Audit

Reuse postojeće `account_deletion_log` tablice. Bez nove migracije (ako tablica već ima `source`, `requested_by`, `target_user_id`, `target_email`, `status`, `details` JSONB kolone). Ako nedostaje neka kolona — odustaje se od izmjene sheme; spremaju se dostupne, ostatak ide u `details` JSONB. **Provjeravam stvarni schema prije writeanja koda** (`supabase--read_query` na `information_schema`).

## 7. Testovi i build status provjera

- **Deno test** za guardrail logiku: `supabase/functions/admin-hard-delete-user/__tests__/allowlist.test.ts` — čisti unit testovi `isEmailAllowed()` helpera (allowed/disallowed slučajevi, case-insensitive, prazni string).
- **Coverage test** iz foundation passa (`purgeUser.coverage.test.ts`) ostaje — nije diran.
- Vitest suite na frontendu: bez novih testova ako `HardDeleteUserDialog` ostane thin presentational (logika je na serveru).
- Build: standardni `npm run build` koji CI radi.
- **Bez** stvarnog purgea testnog korisnika u sklopu ovog passa.

## 8. Što se ne dira

- `purgeUser.ts`, `tablesToPurge.ts`, `process-pending-deletions/index.ts`
- soft delete / Trash flow
- user-facing account deletion (30d grace)
- billing / Stripe refund logika
- krug ownership transfer UI
- bulk admin akcije
- širi admin redesign

## Tehnički detalji

**Files touched (novi)**:
- `supabase/functions/admin-hard-delete-user/index.ts`
- `supabase/functions/admin-hard-delete-user/__tests__/allowlist.test.ts`
- `src/components/admin/HardDeleteUserDialog.tsx`

**Files touched (izmjena)**:
- Postojeća admin user-list komponenta (otkriva se `code--list_dir src/components/admin` i `rg`, vjerojatno `AdminUsersTable.tsx` ili sl.) — dodaje dropdown item + dialog mount.
- `src/i18n/locales/hr.json`, `en.json`, `de.json` — `admin.hardDelete.*` ključevi.

**Secret**:
- `ALLOW_HARD_DELETE` — postavlja se preko `add_secret` u build fazi.

**Response shape**:
```ts
type Response =
  | { status: 'deleted'; residualTables: string[] }
  | { status: 'blocked'; blockedBy: 'krug_multi_member' | 'has_paid_records' }
  | { status: 'failed'; error: string };
```

**Sigurnosna granica**: čak i ako frontend bug propusti krivi email u dialog, server odbija (allowlist + dual-confirmation). Čak i ako se funkcija zove kroz `supabase.functions.invoke` izvan UI-ja, JWT + admin role + env gate + allowlist čine 4 nezavisne barijere.

## Finalni sud

Spreman za build. Jedina runtime ovisnost je `ALLOW_HARD_DELETE` secret — postavlja se kao prvi korak builda preko `add_secret`.
