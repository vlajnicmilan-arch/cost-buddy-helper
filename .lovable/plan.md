
## Uski fix — scan preview fallback za payment source

### Diran file
- `src/components/add-expense/AddExpenseDialog.tsx` (samo `applyScannedResult`, ~L509–538)

### Promjena

U `applyScannedResult`:

1. Izračunaj `resolvedPaymentSource` i `resolvedCustomId` iz `result`.
2. Ako su oba prazna (`!resolvedCustomId && !resolvedPaymentSource`):
   - `fallback = pickDefaultPaymentSource(customPaymentSources)`
   - ako je `custom:<id>` → `resolvedCustomId = <id>`, `resolvedPaymentSource = null`
   - inače → `resolvedPaymentSource = fallback`
3. Lokalni `setPaymentSource(...)` postavi koristeći resolved vrijednosti (umjesto `if (result.payment_source) setPaymentSource(result.payment_source)`).
4. `setScannedData({...})` koristi `resolvedPaymentSource` i `resolvedCustomId` (umjesto sirovih `result.*`).

### Što ostaje netaknuto
- `useReceiptScanner.ts`
- `paymentSourceMatching.ts` / `matchCustomByMethod`
- `ScannedDataPreview.tsx`
- parser / AI prompt
- DB schema, RPC, migracije

### Ograda (zadržana eksplicitno)
`pickDefaultPaymentSource(customPaymentSources)` **nije** semantika "točan gotovinski izvor". To je samo dialog-level fallback (prvi custom, ili biz-match u business modu). Cilj passa je samo konzistencija dialoga i preview-a — ne pogađanje pravog cash izvora.

### Skriveni rizici
- Ako korisnik u personal modu nema "Keš" kao prvi custom izvor, fallback može preselectati npr. "Revolut" (prvi po `created_at`). To je i dalje bolje od standardnog `cash`, ali korisnik treba ručno promijeniti za neke račune.
- U business modu `pickDefaultPaymentSource` bira biz-source aktivnog profila; ako ga nema, vraća `cash`. Preview tada ostaje na `cash` (ponašanje nepromijenjeno).
- Nema riziko side-effecta na save-path: write logika već čita `scannedData.custom_payment_source_id` prije `scannedData.payment_source` (L629–633).

### Acceptance (ručno + automatski)
- ✅ Postojeći `paymentSourceMatching.test.ts` ostaje zelen (logika nije dirana).
- ⚠️ Bez novog vitest testa — promjena je vezana uz React state setere unutar dialoga, scope ne uključuje novi test harness. Ako želiš, dodaj u sljedećem passu.

Prebaci u build mode da apliciram promjenu.
