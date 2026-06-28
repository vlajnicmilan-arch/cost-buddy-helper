
# Hard Delete Foundation — Implementation Plan

Implementiramo shared purge engine i refaktoriramo `process-pending-deletions` da ga koristi. Bez admin entrypointa, bez UI-a, bez izmjena user-facing 30-day flowa.

## Nova otkrića (korigiraju prošli foundation pass)

Provjereno protiv žive sheme i `storage.objects`:

1. **`invoice-pdfs` bucket postoji i ima per-user prefix** (`{user_id}/...`) — nije bio u prošloj listi. Mora u Phase 4.
2. **`public-assets` NEMA user-specific prefix** — samo `releases/*.apk`. Sistemski bucket, **ne ide** u purge. (Pitanje V1 iz prošlog plana: odgovor = ne.)
3. **`email-assets`** sistemski (`logo.png`). Ne ide.
4. **`certificates` bucket** — postoji u kodu, ali u bazi je trenutno prazan. Ostavljamo u listi (defensive).

Ovo se odražava u final listi bucketa: `receipts`, `certificates`, `project-documents`, **`invoice-pdfs`** (novi).

## Files

### Novi

- `supabase/functions/_shared/tablesToPurge.ts` — kanonska kategorizirana lista (single source of truth)
- `supabase/functions/_shared/purgeUser.ts` — engine s fazama 0–7
- `supabase/functions/_shared/purgeUser.types.ts` — `PurgePolicy`, `PurgeResult`, `ResidualScanReport`
- `docs/HARD_DELETE.md` — foundation dokumentacija

### Izmijenjeni

- `supabase/functions/process-pending-deletions/index.ts` — thin wrapper nad `purgeUser`

### Netaknuti (eksplicitno)

- `request-account-deletion`, `cancel-account-deletion`, `e2e_reset_user`, admin UI, sve client komponente.

## `tablesToPurge.ts` — kanonska struktura

```ts
export const PURGE_BY_USER_ID: readonly string[] = [/* 60 tablica */];
export const PURGE_BY_EMAIL: readonly { table: string; column: string }[] = [/* 6 */];
export const PURGE_DEPENDENT: readonly {
  table: string;
  via: 'expense_id' | 'invoice_id' | 'travel_order_id' | 'budget_id' | 'project_id' | 'krug_id' | 'created_by' | 'generated_by' | 'referrer_or_referred';
  parentTable?: string;
}[] = [/* 18 */];
export const INTENTIONALLY_KEPT: readonly { table: string; reason: string }[] = [/* 7 */];
export const STORAGE_BUCKETS: readonly string[] = ['receipts','certificates','project-documents','invoice-pdfs'];
export const PAID_RECORDS_TABLES: readonly string[] = ['lifetime_purchases'];
```

Sve `public` tablice iz `information_schema` moraju biti pokrivene jednom od pet kategorija (po `user_id` / po emailu / dependent / intentionally kept / nije korisnička). Inače pada coverage test (vidi dolje).

## `purgeUser.ts` — kontrakt

```ts
purgeUser(admin, {
  userId, userEmail,
  policy: {
    sourceTag: 'cron_grace' | 'admin_hard_delete',
    allowKrugDestruction?: boolean,   // default false
    deletePaidRecords?: boolean,      // default false
    cancelStripeSubscription?: boolean, // default true
  }
}) => Promise<PurgeResult>
```

### Faze (zaključano redoslijedom)

```text
0  pre-flight
   - load auth user
   - krug guard: ako postoji krug_ownership za usera, i bilo koji od tih krugova
     ima krug_membership redak s drugim user_id → return { ok:false, blockedBy:'krug_multi_member', krugIds:[...] }
     (bez allowKrugDestruction override)
   - paid records guard: COUNT(lifetime_purchases) > 0 i !deletePaidRecords → blockedBy:'paid_records_present'
1  dependent rows (joins) — prije roditelja
2  user-owned (po user_id)
3  invitations & subscriptions po emailu
4  storage cleanup (4 bucketa)
5  Stripe subscription cancel (po emailu)
6  profile + auth.admin.deleteUser
7  residual scan + audit upis
```

### Residual scan

Nakon faza 1–6, izvodi se `SELECT count(*) FROM <table> WHERE user_id=$1` za svaku tablicu iz `PURGE_BY_USER_ID`, plus join-counts za dependent listu, plus email counts. Sve > 0 ulazi u `ResidualScanReport`. Upisuje se u `account_deletion_log.tables_purged` JSONB kao `{ tables, storage, residuals, blocked }`. Ako residuals ima ijedan ne-nulti unos → log status postaje `completed_with_residuals` i ide insert u `app_diagnostics_logs` (severity warning).

## Krug multi-member zaštita

```sql
-- pseudo
SELECT k.id FROM krug_ownership ko
JOIN krug k ON k.id = ko.krug_id
WHERE ko.user_id = $1
  AND EXISTS (
    SELECT 1 FROM krug_membership km
    WHERE km.krug_id = k.id AND km.user_id <> $1
  );
```

Ako bilo koji redak vraćen → `blocked`. Briše se SAMO ako je solo krug. Bez nove product odluke za multi-member — to ostaje cron-safe blocked status; admin se kasnije može svjesno odlučiti override.

## `process-pending-deletions` refaktor

Postaje ~40 linija:

```ts
Deno.serve(async (req) => {
  // CORS
  const { data: pending } = await admin.from('account_deletion_log')
    .select('*').eq('status','pending').lte('scheduled_for', now).limit(50);

  const results = [];
  for (const log of pending ?? []) {
    // pošalji completion email PRIJE brisanja
    await sendCompletionEmail(log);
    const r = await purgeUser(admin, {
      userId: log.user_id,
      userEmail: log.user_email,
      policy: { sourceTag: 'cron_grace' }, // konzervativno: blokira krug+paid
    });
    await admin.from('account_deletion_log').update(
      mapResultToAuditUpdate(r)
    ).eq('id', log.id);
    results.push({ user_id: log.user_id, ok: r.ok, blockedBy: r.blockedBy });
  }

  return jsonOk({ processed: results.length, results });
});
```

Bitno: današnji bug (cron tiho prelazi krug s drugim članovima) postaje vidljiv kao `blocked` log umjesto data corruptiona.

## Coverage test

`supabase/functions/_shared/__tests__/purgeUser.coverage.test.ts` (Deno test, ne vitest):

- Otvara migracije / koristi `information_schema` snapshot (statičku listu fiksiranu u testu, da ne ovisi o DB connectionu u CI-ju).
- Za svaku tablicu provjerava: nalazi se u jednoj od 5 kategorija (`BY_USER_ID`, `BY_EMAIL`, `DEPENDENT`, `INTENTIONALLY_KEPT`, ili eksplicitnoj listi `NON_USER_TABLES` koja sadrži `app_settings`, `email_send_state`, `monitor_alerts_log`, …).
- Failure poruka: "Tablica X nije kategorizirana — dodaj je u tablesToPurge.ts ili NON_USER_TABLES".

## Dokumentacija — `docs/HARD_DELETE.md`

Sekcije:

1. Što engine briše (5 kategorija + bucketi)
2. Što namjerno ostaje i zašto (audit, financijski)
3. Krug multi-member pravilo
4. Paid records pravilo
5. Residual scan — kako čitati log
6. Kako proširiti listu kad se doda nova tablica (i test koji to enforce-a)
7. Zašto admin entrypoint NIJE u ovom passu (sigurnost: prvo dokazati potpunost na cron flowu)

## Što namjerno ostaje izvan purgea

| Tablica | Razlog |
|---|---|
| `account_deletion_log` | GDPR audit (90 dana), email anonimiziran |
| `admin_module_grants` | audit admin akcija (granted_by/revoked_by tragovi) |
| `subscription_migration_log` | financijski audit |
| `monitor_alerts_log` | sistemski |
| `email_send_log` | outbound audit |
| `email_send_state` | sistemski |
| `app_settings` | sistemski |
| `lifetime_purchases` | uvjetno — samo s `deletePaidRecords:true` |

Operativni audit (`bug_reports`, `support_tickets`, `feedback_submissions`, `dpa_requests`) **se briše** — sadrže osobne podatke. Opciju anonimizacije ostavljamo za admin tool layer (nije ovaj pass).

## Provjere prije završetka

1. `deno check supabase/functions/_shared/purgeUser.ts`
2. Coverage test pokrenut
3. Lint čist
4. Manual sanity: pozvati `process-pending-deletions` s 0 pending zapisa — mora vratiti `{processed:0}`
5. Build status zelen

## Otvoreni rizici nakon ovog passa

- **R1 zatvoren:** cron više ne ostavlja tragove u 16+ tablica.
- **R2:** prvi cron run nakon deploya može logirati `blocked` za stvarne pending zahtjeve gdje korisnik ima multi-member krug. To je značajka, ne bug — admin to mora ručno riješiti (kasniji admin tool).
- **R3:** ako se ikad doda nova tablica s `user_id` bez ažuriranja `tablesToPurge.ts`, coverage test pada u CI-ju → drift se ne može tiho dogoditi.

Nema blockera za kasniji admin hard delete entrypoint — on će biti tanak wrapper s `policy: { sourceTag: 'admin_hard_delete', allowKrugDestruction: true, deletePaidRecords: true }` + allowlist guard.
