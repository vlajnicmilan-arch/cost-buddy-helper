

## Razdvajanje preuzimanja i dijeljenja

### Problem

Trenutno na nativnoj Android aplikaciji svaki izvoz datoteke (PDF, CSV, JSON, ICS) automatski otvara **Share dijalog**. Korisnik mora kroz dijaloga odabrati "Spremi u datoteku" da bi datoteku stvarno preuzeo. Web verzija već radi kako treba — datoteka se direktno preuzme.

### Cilj

Razdvojiti dvije akcije na nativnoj aplikaciji:
- **📥 Preuzmi** — sprema PDF direktno u javnu **Downloads** mapu uređaja, bez dijaloga (samo potvrda "Spremljeno u Downloads")
- **📤 Podijeli** — otvara Share dijalog (WhatsApp, email, Drive…)

Na webu **Preuzmi** radi kao i sada (browser download), **Podijeli** koristi `navigator.share` ako je dostupan, inače kopira link/tekst.

---

### Promjene u `src/lib/fileExport.ts`

Dodati opcijski parametar `mode`:

```ts
type ExportMode = 'save' | 'share';

export async function exportFile(
  blob: Blob, 
  fileName: string, 
  mode: ExportMode = 'save'  // novi default = SAVE (preuzimanje)
): Promise<boolean>
```

**Native ponašanje po modu:**

| Mode | Direktorij | Otvara Share? | Korisnik vidi |
|---|---|---|---|
| `save` | `Directory.Documents` (javna mapa) | ❌ Ne | Status feedback "Spremljeno u Dokumenti/Download" |
| `share` | `Directory.Cache` (privatna) | ✅ Da | Android Share Sheet |

**Web ponašanje po modu:**

| Mode | Akcija |
|---|---|
| `save` | Klasično `<a download>` (kao sada) |
| `share` | `navigator.share({ files: [...] })` ako podržano, inače fallback na download |

Pomoćne funkcije `exportPDFDoc` i `exportTextFile` dobivaju isti `mode` parametar (default `'save'`).

---

### Promjene u dijalozima — gumbi za izvoz

Svuda gdje sada postoji jedan gumb (npr. "PDF", "Dnevnik PDF", "CSV", "JSON"), pretvaramo ga u **dropdown s 2 opcije**:

```text
[ 📄 Dnevnik PDF ▾ ]
   ├ 📥 Preuzmi
   └ 📤 Podijeli
```

**Komponenta**: novi mali wrapper `<ExportButton>` u `src/components/ui/export-button.tsx` — koristi shadcn `DropdownMenu` + `Button`. Prima `label`, `icon`, i `onExport(mode)` callback. Time izbjegavamo duplo-kodiranje na svakom mjestu.

**Mjesta gdje se mijenja:**

| Datoteka | Gumbi koji se nadograđuju |
|---|---|
| `src/components/projects/ProjectReportsDialog.tsx` | CSV, JSON, **Dnevnik PDF**, PDF |
| `src/components/reports/ReportsDialog.tsx` | PDF, CSV, JSON izvozi izvještaja |
| `src/components/timeclock/TimeClockMonthlyReport.tsx` | PDF/CSV/JSON evidencije rada |
| `src/components/BackupRestore.tsx` | Sigurnosna kopija (JSON) |
| `src/pages/Calendar.tsx` (ICS izvoz) | ICS kalendar |
| Ostale točke koje koriste `exportPDFDoc` / `exportTextFile` | Isto |

---

### Status feedback

Nakon **Preuzmi** na nativnom uređaju:
- ✅ Zelena potvrda: **"Datoteka spremljena u Dokumenti"** (1200 ms, kroz `showSuccess`)
- Ako Filesystem write padne → crveni `showError` s razlogom

Nakon **Podijeli**:
- Otvara se Share Sheet — bez dodatne potvrde

---

### Lokalizacija

Novi ključevi u `hr.json`, `en.json`, `de.json`:

```json
"export": {
  "download": "Preuzmi",
  "share": "Podijeli",
  "savedToDocuments": "Spremljeno u Dokumenti",
  "shareError": "Dijeljenje nije uspjelo"
}
```

---

### Tehnički detalji za nativno spremanje

Capacitor Filesystem API:
```ts
await Filesystem.writeFile({
  path: fileName,
  data: base64Data,
  directory: Directory.Documents,  // javna mapa, vidljiva u Files appu
  recursive: true,
});
```

Na Androidu `Directory.Documents` mapira na `/storage/emulated/0/Documents/` — datoteka je odmah vidljiva u **Files** aplikaciji bez ikakve dodatne dozvole (od Android 11+ scoped storage).

Ako uređaj odbije write (rijetko, stariji Android), pada se na `Directory.Cache` + tihi Share dijalog kao fallback.

---

### Što se NE mijenja

- Web `download` ponašanje za sve postojeće gumbe ostaje isto kad se klikne **Preuzmi**
- Logika generiranja PDF-a, CSV-a, JSON-a (jsPDF, autoTable…)
- RLS, baza, edge funkcije
- Ostale komponente koje ne rade izvoz datoteka

---

### Očekivani ishod

- U **Izvještaji projekta** (i svim drugim mjestima izvoza) klikneš na **Dnevnik PDF ▾** → biraš **Preuzmi** ili **Podijeli**
- **Preuzmi** na Androidu → datoteka odmah u `Documents` mapi, bez Share dijaloga, samo zelena potvrda
- **Preuzmi** na webu → klasičan browser download
- **Podijeli** → Android Share Sheet (WhatsApp, Drive, Email…) ili `navigator.share` na webu
- Konzistentno ponašanje na svim ekranima koji izvoze datoteke

