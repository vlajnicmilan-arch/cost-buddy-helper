

## Spriječiti otvaranje tipkovnice tijekom skeniranja računa

### Pravi uzrok (provjereno u kodu, nije nagađanje)

U `src/components/add-expense/ManualExpenseForm.tsx` na **liniji 213** input "Trgovac/Izvor" ima `autoFocus`:

```tsx
<Input
  id="merchant"
  ...
  autoFocus
/>
```

Kad otvoriš dijalog "Nova transakcija" (čak i kroz `autoScan` tok preko gumba kamera/skener), Android automatski fokusira taj input → tipkovnica iskoči. Iako se preko forme prikazuje `ScanningOverlay` (vidljivo na screenshotu — "Analiziram račun..."), **input ispod ostaje fokusiran** jer overlay je samo vizualni sloj na vrhu — ne briše fokus s elementa ispod. Zato tipkovnica ostaje otvorena cijelo vrijeme analize.

Dodatno: `autoFocus` je problem i kad korisnik ne skenira (samo ručno otvori formu) — tipkovnica iskoči odmah, što često nije ono što korisnik želi (često prvo bira iznos ili payment source).

### Rješenje (2 male izmjene, bez funkcionalnih promjena)

**Izmjena 1 — `ManualExpenseForm.tsx` (linija 213):**
Ukloniti `autoFocus` s Merchant inputa. Tipkovnica se neće više sama otvarati pri otvaranju dijaloga. Korisnik ju otvara **samo kad sam tapne na polje** koje želi popuniti — što je standardno mobilno ponašanje (npr. Revolut, Spendee).

**Izmjena 2 — `AddExpenseDialog.tsx` (u `handleNativeCapture`, oko linije 250):**
Prije pozivanja kamere eksplicitno pozvati `(document.activeElement as HTMLElement)?.blur()` — defenzivno, za slučaj da je korisnik već stigao tapnuti na neko polje prije skeniranja. Time osiguramo da tipkovnica nestane prije nego se pokrene analiza.

```tsx
const handleNativeCapture = async (source, multiMode = false) => {
  // Skidamo fokus s bilo kojeg inputa da Android ne drži tipkovnicu otvorenu
  (document.activeElement as HTMLElement)?.blur?.();
  cameraActiveRef.current = true;
  ...
};
```

Iste blur pozive dodajem i u `handleImageCapture` (web fallback) i u trenutku kad se pokrene `processImageBase64` — defenzivno na 3 razine.

### Što NE diram

- `ScanningOverlay` ostaje identičan (radi savršeno vizualno).
- Logika skeniranja, AI analize, Save tijeka — sve isto.
- Postojeći `autoScan` tijek — samo skidam fokus, ne mijenjam flow.
- Drugi dijalozi s `autoFocus` (npr. Edit) — ne diram, jer tamo nema skeniranja.

### Tehnički detalji

| Datoteka | Linija | Promjena |
|---|---|---|
| `src/components/add-expense/ManualExpenseForm.tsx` | 213 | Ukloniti `autoFocus` |
| `src/components/add-expense/AddExpenseDialog.tsx` | ~250 (`handleNativeCapture`) | Dodati `(document.activeElement as HTMLElement)?.blur?.()` na početku |
| `src/components/add-expense/AddExpenseDialog.tsx` | ~269 (`handleImageCapture`) | Isto |

Ukupno: **3 male izmjene, bez novih ovisnosti, bez promjena u i18n.**

### Trajanje

~2 minute. Verifikacija na uređaju: otvoriš dijalog ili pokreneš skener — tipkovnica se ne pojavljuje. Kad kasnije tapneš na polje (npr. iznos), tipkovnica iskoči normalno.

### Pitanje (jedno, brzo)

Želiš li da `autoFocus` **u potpunosti uklonim** (preporučeno — najmanja iznenađenja, standardno mobilno ponašanje), ili da ga zadržim ali samo za **slučaj kad korisnik otvori dijalog običnim "+" gumbom** (ne preko skenera)? Drugi scenarij je tehnički izvediv (uvjetni `autoFocus={!autoScan}`), ali u praksi i tu većina korisnika preferira da tipkovnica ne iskače sama.

Ako kažeš "kreni" — idem s **potpunim uklanjanjem** `autoFocus`.

