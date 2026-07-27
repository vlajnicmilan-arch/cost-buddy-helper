
# Faza C — prijedlog izvedbe (Krug settlement automatizacija)

Status: **prijedlog, nije odobren**. Ništa se ne gradi dok Milan ne kaže "gradi". Faze A/B zatvorene, Milan odobrio cilj (puni C s multi-currency). Grupirano u 4 pod-faze, gradive inkrementalno; svaka je sama za sebe upotrebljiva.

## Rizik / non-goals (potvrde tražene)

- **Balance engine i `expenses` write put se NE diraju.** Sve nove tablice žive uz Krug ledger, čitanje ide kroz postojeće RPC-ove (`krug_settlement_preview`). `touches_balance=false` za cijelu Fazu C.
- **Cron infrastruktura postoji** (`audit_secdef_anon_regression`, `monitor-app-health`, `backup-weekly`, `flush-participant-digest`, `check-*`). Reuse: pg_cron + `net.http_post` s vault-storaged internal key (isti obrazac kao `krug_emit_notification`). **Nema novog secreta ako reuse-amo `krug_notify_internal_key`** za nove Krug cron edge fn pozive.
- **Default privilege revoke** za nove SECDEF funkcije: već automatski (ALTER DEFAULT PRIVILEGES). Svaka nova cron/service fn eksplicitno `REVOKE ALL FROM anon, PUBLIC` + `GRANT EXECUTE TO service_role` radi paper traila.
- **Nova cron funkcija** (npr. `krug_cron_freeze_fx_snapshots`) mora biti service_role only — isti obrazac kao audit regression cron.

---

## C1 — FX snapshot per period + auto-freeze cron

**Cilj:** povijesni settlement izračun postaje immutabilan po zaključenju perioda.

### C1.1 Tablica `krug_settlement_fx_snapshot`
- Kolone: `krug_id uuid`, `period_start date`, `period_end date`, `display_currency text`, `rates jsonb`, `snapshot_date timestamptz`, `source text` (npr. `frankfurter.app`), `frozen_at timestamptz`, `frozen_by text` (`'cron'|'manual'`).
- PK: `(krug_id, period_start, period_end, display_currency)`.
- RLS: SELECT za članove kruga (kroz postojeći `is_krug_member(auth.uid(), krug_id)`); INSERT/UPDATE samo `service_role`.
- GRANT: `SELECT` na `authenticated`, `ALL` na `service_role`. Bez `anon`.

### C1.2 Preview RPC prilagodba (minimalna)
- `krug_settlement_preview` dobiva neobavezan interni ogranak: **ako postoji snapshot za taj `(krug_id, period, display_currency)` — koristi `rates` iz snapshota i ignoriraj `p_fx_rates` parametar**; inače koristi klijentski `p_fx_rates` (kao danas, Faza A ponašanje za tekući period).
- Backward-compat: potpis RPC-a ostaje isti. Klijent (`useKrugSettlement`) i dalje šalje `rates` iz `useExchangeRates` — RPC odlučuje.
- U response payload dodati flag `fx.frozen: boolean` da UI zna prikazati "podaci zamrznuti".

### C1.3 Cron freeze fn
- **Opcija A (preporučeno):** čista SQL cron funkcija `public.krug_cron_freeze_fx_snapshots()` (SECDEF, service_role only) — zove postojeći `exchange-rates` edge fn preko `net.http_post`, zapiše snapshot za sve aktivne Krugove za prethodni mjesec. Prednost: nema novog edge fn, jedna round-trip komponenta.
- **Opcija B:** nova edge fn `krug-freeze-fx-snapshots` — samo ako trebamo složeniju logiku (npr. hitrost cache-anja rata).
- **Preporuka: A.** Manje pomičnih dijelova; `exchange-rates` fn već postoji i vraća ratese.
- Schedule: `0 3 1 * *` (1. u mjesecu, 03:00 UTC) za period `[prošli_mjesec_start, prošli_mjesec_end]`.
- Idempotent: `ON CONFLICT (krug_id, period_start, period_end, display_currency) DO NOTHING`.

**Ovisnosti:** postojeći `exchange-rates` edge fn, `net.http_post`, `vault` (reuse `krug_notify_internal_key` ili novi `krug_fx_freeze_internal_key` — Milan odlučuje).

---

## C2 — Reminderi + push notifikacije

### C2.1 Weekly Krug settlement reminder
- **Nova preferenca**: `notification_preferences.krug_settlement_reminder_enabled boolean default true`.
  - Napomena: postojeći `krug_enabled` je globalni Krug prekidač; settlement reminder je posebna vertikala (weekly digest), pa opravdana zasebna preferenca. Ako Milan preferira reuse, `krug_enabled` je fallback.
- **Edge fn `krug-settlement-reminder`** — cron `0 8 * * 1` (ponedjeljak 08:00 UTC).
  - Za svakog usera koji ima `krug_settlement_reminder_enabled=true` I `krug_enabled=true`, agregira nepodmirene transfere po Krugu (preview.transfers minus ledger settled) i emitira 1 notifikaciju po Krugu ("Imaš N nepodmirenih stavki u Krugu X, ukupno €Y").
  - Šalje kroz postojeći `krug_emit_notification` sloj (koji zove `notify-krug-event`) — reuse push, in-app, i18n već pokriveni.

### C2.2 Push kad se transfer označi podmireno (odgođeno iz Faze B)
- `krug_mark_settled` RPC (postoji) dodaje `PERFORM krug_emit_notification(...)` s eventom `settlement_marked_settled` i payloadom `{from_user, to_user, amount, currency}`.
- `notify-krug-event` fn: dodati case za novi event, exclude actor (isti obrazac kao ostali eventi — već testirano u `notifyKrugEventGuards.test.ts`).
- i18n: novi ključevi `notifications.krug.settlementMarkedSettled.title/body` u hr/en/de.

**Ovisnosti:** postojeći `krug_emit_notification` + `notify-krug-event` (zero-diff arhitektura), `notification_preferences`.

---

## C3 — PDF izvoz settlement izvještaja

- **Infrastruktura postoji**: `src/lib/loadJsPdf.ts`, `pdfBranding.ts`, `pdfReportKit.ts`, referentni izvoznici (`projectFinancePdfExport.ts`, `decisionPdfExport.ts`, `invoicePdf.ts`).
- **Preporuka: klijentski PDF, ne edge fn.** Konzistentno s ostatkom aplikacije (jsPDF + autoTable), radi offline, ne troši edge fn budget, koristi postojeći branding kit.
- Nova datoteka `src/lib/krugSettlementPdf.ts`:
  - Fn `exportKrugSettlementPdf({ krug, period, preview, ledger, brand, mode })`.
  - Sadržaj: header (Krug ime, period, display_currency, FX source + snapshot date + `frozen` flag), tablica članova (paid/owed/net), tablica transfera (from → to, amount, currency, status: predloženo/podmireno/void), timeline void/settle akcija iz `krug_settlement_ledger`.
  - Footer: brand kit (isti kao `projectFinancePdfExport`).
- UI hook: gumb "Izvezi PDF" u `KrugSettlementSection.tsx` pored postojeće povijesti.
- i18n: `krug.settlement.pdf.*` (hr/en/de).

**Ne graditi edge fn PDF varijantu za launch** — post-launch samo ako treba server-side (npr. e-mail attachment).

---

## C4 — SQL invariant testovi (manualni template)

- Nova datoteka `supabase/tests/krug/settlement_invariants.sql` (rollback-safe template, isti obrazac kao `governance_flow.sql` — **ne izvršava se protiv produkcije**).
- Invarijante:
  1. **Balance sum**: `sum(members.paid) == sum(members.owed)` po periodu (tolerancija za FX zaokruživanje: ±0.02 * broj_članova).
  2. **Settled ≤ owed**: za svaki par (from, to), `sum(ledger.settled_amount) ≤ preview.transfer.amount`.
  3. **FX snapshot immutabilnost**: nakon freeze-a, ponovno izvršavanje `krug_settlement_preview` za taj period vraća **istovjetne** transfere (byte-equal na round(6)).
  4. **Override integritet**: svaka `krug_expense_split_override.status='potvrdjena'` ima potvrde od svih punopravnih članova (osim predlagatelja koji se auto-računa).
  5. **Ledger non-negativity**: `sum(settled_amount) - sum(voided_amount) >= 0` po (krug, from, to, currency).
- Header s a/b/c/d klauzulama (isti template stil): BEGIN...ROLLBACK, sintetički korisnici, COUNT prije=poslije, pg_locks provjera.
- **Ne dispatch-ati** — ostaje kao dev-cluster referenca.

---

## Predlagani redoslijed gradnje (inkrementalno)

1. **C1** (FX snapshot + preview integracija + cron) — temelj, mora prvo.
2. **C2** (reminderi + push) — nezavisno od C1, može paralelno.
3. **C3** (PDF izvoz) — čisti frontend, može zadnje ili paralelno s C2.
4. **C4** (invariant template) — nakon C1 (jer testira FX immutabilnost).

## Post-launch kandidati (moja preporuka za odgodu)

- **PDF preko edge fn** (server-side) — jsPDF klijentski pokriva launch use-case.
- **Realtime settlement dashboard widget** (agregat kroz sve Krugove korisnika).
- **Push za override propose/confirm eventi** — dodatak povrh in-app notifikacija.

---

## Otvorena pitanja za Milana (traže odluku prije koda)

1. **FX snapshot vault key**: reuse `krug_notify_internal_key` ili novi `krug_fx_freeze_internal_key`?
2. **Weekly reminder preferenca**: nova `krug_settlement_reminder_enabled` ili reuse postojeći `krug_enabled`?
3. **Cron schedule za reminder**: ponedjeljak 08:00 UTC odgovara ili drugi termin?
4. **PDF sadržaj**: uključiti i override povijest (tko je predložio/potvrdio) ili samo settlement transfere?

Čekam Milanove odgovore + eksplicitno "gradi" prije bilo kakvog koda.
