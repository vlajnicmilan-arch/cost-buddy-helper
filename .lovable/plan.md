## Cilj
Gumb "Višestraničan račun" je trenutno tekstualni link i ne izgleda klikabilno. Pretvoriti ga u jasan outlined button + lokalizirati cijelu multi-page sekciju (trenutno hardcoded HR).

## Promjene

### `src/components/add-expense/ReceiptCaptureButtons.tsx`

**Toggle gumb (linije 101–109):** zamijeniti `<button>` link sa shadcn `<Button variant="outline" size="sm">`, full-width, `rounded-xl`, `border-dashed`, `gap-2`, muted boja koja se osvijetli na hover. Ikona `Layers` (lucide) umjesto 📄. Tekst preko `t('scanner.multiPageReceipt')`.

**Multi-image collector (linije 113–174):** zamijeniti sve hardcoded stringove s `t()` ključevima:
- "Dodaj sve stranice računa ({{count}}/5)" → `t('scanner.multiPageTitle', { count, max: 5 })`
- "Dodaj stranicu" → `t('scanner.addPage')`
- "Iz galerije" → `t('scanner.fromGallery')`
- "Analiziram..." → `t('scanner.analyzingShort')`
- "Skeniraj N stranicu/stranice" → `t('scanner.scanPagesOne/Few/Many', { count })` (HR pluralizacija)
- "Maksimalno 5 stranica" → `t('scanner.maxPages', { max: 5 })`

### i18n (`hr.json`, `en.json`, `de.json`) — scanner namespace
Dodati ključeve: `multiPageReceipt`, `multiPageTitle`, `addPage`, `scanPagesOne/Few/Many`, `analyzingShort`, `maxPages`.

## Izvan scopea
- Ne diram logiku skeniranja, native flow, ni vizual gornjih Fotografiraj/Iz galerije gumba.
- Bez DB / native promjena → bez version bumpa.