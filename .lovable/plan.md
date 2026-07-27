# Faza C2 — Prijedlog izvedbe (NE gradi dok Milan ne kaže "gradi C2")

Sve promjene su **aditivne**. `touches_balance = false` za cijeli C2 (potvrđeno u dijelu 7).

---

## 1. Migracija: nova preferenca

Živa struktura `notification_preferences` potvrđena (24 kolone, `krug_enabled bool default true` već postoji, svaka preferenca je zasebna `bool NOT NULL` kolona sa `DEFAULT`).

```sql
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS krug_settlement_reminder_enabled boolean NOT NULL DEFAULT true;
```

- Isti obrazac kao `krug_enabled`, `daily_summary_enabled`. Default `true` → postojeći redovi automatski uključeni.
- Nema izmjene RLS-a (postojeće politike pokrivaju sve kolone).
- **Zasebna od `krug_enabled`** — user može ugasiti samo remindere, a zadržati transactional Krug pushove.
- Filter pri slanju: `krug_enabled = true AND krug_settlement_reminder_enabled = true`.
- Bez izmjena `types.ts` u ovoj migraciji (regenerira se automatski nakon approve).

---

## 2. Edge fn `krug-settlement-reminder`

**Datoteka:** `supabase/functions/krug-settlement-reminder/index.ts`
**config.toml:** `verify_jwt = false` (kao `krug-freeze-fx-snapshot`).

**Zaštita (identična freeze fn):**
- Gateway: anon key u `Authorization` (potrebno za `pg_net`).
- Interni sloj: header `x-krug-internal-key` mora se poklopiti s env `KRUG_NOTIFY_INTERNAL_KEY` (constant-time compare). Bez key-a → `401` prije bilo kakvog rada.
- Reuse postojećeg secreta `krug_notify_internal_key` (vault + edge env).

**Logika (SERVICE_ROLE klijent):**
1. Učitaj sve krugove: `SELECT DISTINCT krug_id FROM krug_membership WHERE role='punopravni'`.
2. Za svaki krug pozovi `krug_settlement_preview(p_krug_id)` (već postoji, već korigira ledger, već čita FX snapshot iz C1).
   - **Reuse RPC-a** — ne dupliramo netting logiku u TS-u.
3. `preview.transfers` = rezidualne nepodmirene stavke (ledger je već oduzet unutar RPC-a). Ako je prazno → skip krug.
4. Grupiraj transfere po **primatelju** (`to_user`) i po **dužniku** (`from_user`) — svaki punopravni član dobije notifikaciju samo za retke gdje je involviran (from **ili** to).
5. Za svakog takvog usera:
   - Provjeri `notification_preferences.krug_enabled = true AND krug_settlement_reminder_enabled = true` (join). Ako false → skip.
   - Sumiraj (jednostavno per-currency total; multi-currency → prikaži glavnu valutu Kruga + `+N more` u body).
   - Pozovi `krug_emit_notification(event_type := 'krug_settlement_reminder', p_krug_id, p_actor_id := <system uuid ili NULL>, p_dedup_ref := 'reminder:'||krug_id||':'||to_char(now(),'IYYY-IW'), p_recipient_override := ARRAY[user_id])`.
   - **Dedup po ISO tjednu** → dupli cron pokreti u istom tjednu neće poslati duplu notifikaciju (postojeći notification insert path već koristi `dedup_ref` za unique gating).

**Cron schedule (zaseban SQL insert, ne dio migracije edge fn):**
```sql
DO $$ BEGIN
  PERFORM cron.unschedule('krug_settlement_reminder_weekly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'krug_settlement_reminder_weekly',
  '0 8 * * 1',  -- pon 08:00 UTC
  $$ SELECT net.http_post(
       url := 'https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/krug-settlement-reminder',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'apikey', <anon key>,
         'Authorization', 'Bearer ' || <anon key>,
         'x-krug-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='krug_notify_internal_key' LIMIT 1)
       ),
       body := '{}'::jsonb
     ); $$
);
```

**Ne kreira SECDEF RPC** (za razliku od freeze) — reminder samo čita i emitira kroz postojeći `krug_emit_notification`. Ako Milan preferira konzistentnost s C1 obrascem (RPC wrapper + service_role-only + cron zove RPC), reci — dodat ćemo `krug_cron_settlement_reminders()` wrapper. **Prijedlog:** direktan `net.http_post` iz cron-a je jednostavniji, isti sigurnosni profil (internal key iz vaulta), manje površine.

---

## 3. `krug_mark_settled` — aditivni PERFORM na kraju

Živa definicija pročitana (`pg_get_functiondef`). Trenutni tok: auth check → member checks → validacija → **advisory lock** → INSERT u ledger → RETURN.

**Izmjena:** dodaj **jedan** `PERFORM` **nakon** `INSERT ... RETURNING id INTO v_id`, **prije** `RETURN`. Sve ostalo (lock, INSERT, validacije, potpis, RETURN shape) ostaje bit-identično.

```sql
-- ... (postojeći INSERT) ...
RETURNING id INTO v_id;

-- C2: aditivni push (best-effort; ne mijenja settlement rezultat)
BEGIN
  PERFORM public.krug_emit_notification(
    p_event_type := 'krug_settlement_marked_settled',
    p_krug_id := p_krug_id,
    p_actor_id := v_uid,
    p_dedup_ref := 'settled:'||v_id::text
    -- recipient_override NULL → resolver uzima punopravne članove, exclude actor
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'krug_mark_settled: notify failed: %', SQLERRM;
END;

RETURN jsonb_build_object('ok', true, 'id', v_id);
```

**Concurrency/idempotentnost netaknuti:**
- Advisory lock već otpušten na COMMIT-u; PERFORM je unutar iste transakcije, iste tx-lock semantike.
- Dedup po `settled:<ledger_id>` — ledger PK je unique → svaki settled event dedupa 1:1. Retry istog RPC poziva ne postoji (INSERT bi kreirao novi red).
- `EXCEPTION` wrap: ako notify padne (npr. vault key nedostaje), settlement svejedno prolazi — isti obrazac kao `krug_emit_notification` interno (warn + return).
- `krug_emit_notification` koristi `net.http_post` koji je async → nema blokiranja settlement RPC-a.

---

## 4. `notify-krug-event` — novi event

**Izmjena `supabase/functions/notify-krug-event/index.ts`:**

1. Proširi tipove:
   ```ts
   type EventType = ... | "krug_settlement_marked_settled" | "krug_settlement_reminder";
   const VALID = [..., "krug_settlement_marked_settled", "krug_settlement_reminder"];
   ```
2. Proširi `event_type_shortKey`:
   - `krug_settlement_marked_settled` → `"settlement_settled"`
   - `krug_settlement_reminder` → `"settlement_reminder"`
3. **Exclude actor obrazac** — postojeći kod već radi `recipients.delete(actor_id)` osim za `krug_deleted`. Novi eventi spadaju u default granu → actor automatski isključen. Za reminder actor je system/NULL → delete je no-op.
4. **Recipient resolution** — postojeći put (punopravni članovi) je točan za `marked_settled`. Za `reminder` **koristimo `recipient_override`** (edge fn već cilja pojedinca) → resolver samo verificira listu.
5. Bez izmjena dedup/insert logike (već koristi `dedup_ref`).

**i18n ključevi (hr/en/de) — dodati u `src/i18n/locales/*/notifications.ts` (ili gdje postoje `notifications.krug.*`):**
- `notifications.krug.settlement_settled.title`
- `notifications.krug.settlement_settled.message` — placeholderi `{from}`, `{to}`, `{amount}`, `{currency}`
- `notifications.krug.settlement_reminder.title`
- `notifications.krug.settlement_reminder.message` — placeholderi `{krug}`, `{count}`, `{total}`, `{currency}`

Točne stringove ću predložiti u build fazi (kratke, u tonu postojećih Krug notifikacija).

---

## 5. Datoteke koje se mijenjaju

| # | Path | Tip |
|---|------|-----|
| M1 | `supabase/migrations/<ts>_c2_reminder_pref_and_mark_settled_notify.sql` | nova migracija: ADD COLUMN + CREATE OR REPLACE `krug_mark_settled` (od žive def) |
| M2 | zaseban `supabase--insert` za `cron.schedule` (anon key nije za migraciju) | project-specific |
| F1 | `supabase/functions/krug-settlement-reminder/index.ts` | nova |
| F2 | `supabase/config.toml` | dodaj `[functions.krug-settlement-reminder] verify_jwt = false` |
| F3 | `supabase/functions/notify-krug-event/index.ts` | +2 event tipa, +2 shortKey grane |
| I1 | `src/i18n/locales/hr/notifications.*` | +4 ključa |
| I2 | `src/i18n/locales/en/notifications.*` | +4 ključa |
| I3 | `src/i18n/locales/de/notifications.*` | +4 ključa |

**Bez dodira:** balance engine, `expenses`, `custom_payment_sources`, `krug_settlement_ledger` shape, `krug_settlement_preview`, netting/override/weights/gate, `krug_freeze_fx_snapshots`, klijentski Krug UI (osim i18n stringova).

---

## 6. Preferenca UI (out-of-scope za ovaj plan)

Novi bool ide u backend. **Toggle u Settings/Notifications UI** nije dio C2 opsega (Milan nije spomenuo). Default `true` znači da su svi useri odmah uključeni. Ako želiš da C2 uključi i UI toggle uz postojeće `krug_enabled` prekidače — javi, dodam kao C2.5.

---

## 7. Kritične potvrde

| Provjera | Status |
|----------|--------|
| `touches_balance=false` | ✅ Reminder samo čita (`krug_settlement_preview`) i emitira notify. `mark_settled` PERFORM je aditivan; postojeći RPC već ne dira `expenses`/`custom_payment_sources`/anchor. Nova preferenca kolona je bool na `notification_preferences`. |
| Reminder fn zaštićena | ✅ Isti dual layer (anon gateway + `x-krug-internal-key`) kao freeze fn. 401 bez internal key-a. |
| REVOKE anon/PUBLIC | ✅ Migracija ne kreira nove SECDEF funkcije (osim CREATE OR REPLACE `krug_mark_settled`, koja zadržava postojeći security profil). Ako Milan odabere opciju s `krug_cron_settlement_reminders()` wrapperom → dodat ćemo REVOKE FROM PUBLIC,anon,authenticated + GRANT service_role obrazac (isto kao `krug_cron_freeze_fx_snapshots`). |
| `mark_settled` concurrency/idempotentnost | ✅ Advisory lock, INSERT, RETURN shape netaknuti. PERFORM je poslije INSERT-a, wrap u EXCEPTION → notify failure ne baca settlement. Dedup `settled:<ledger_id>` (ledger PK unique). |
| Vitest | Očekivano ostaje 2092/2092 (klijent netaknut osim i18n stringova). |

---

## 8. STOP uvjeti (ne gradim ako):
- Milan želi C2 bez novog eventa u `notify-krug-event` (nemam alt kanal za push).
- `krug_notify_internal_key` nije prisutan u edge env (bez njega reminder fn ne može auth-ati sama sebe u prod-u).
- Milan želi cron wrapper RPC umjesto direktnog `net.http_post` iz cron-a — reci prije builda, radim po C1 obrascu.
- Milan želi da reminder ide samo dužnicima ili samo primateljima (trenutni prijedlog: oboje, jer oba su "involvirana strana").

---

## 9. Otvorena pitanja za Milana prije builda

1. **Reminder recipient scope:** obje strane transfera (dužnik + primatelj) ili samo dužnik ("ti duguješ X")? Prijedlog: obje.
2. **Multi-currency u jednoj notif:** dominantna valuta + `+N more` u body, ili zasebna notif per currency? Prijedlog: prvo.
3. **Cron wrapper RPC** (C1 obrazac) vs direktan `net.http_post` iz cron SQL-a? Prijedlog: direktan (jednostavnije, isti sigurnosni profil).
4. **UI toggle za novu preferencu** — dio C2 (C2.5) ili zasebna faza?

Čekam odgovore + eksplicitno "gradi C2".
