

## Plan: Popravak izvoznih gumba u AI asistentu

### Dijagnoza

Pregledao sam kod u `FinancialAssistantDialog.tsx`. Gumbi za izvoz (CSV, PDF, Ispis) pojavljuju se **samo** ako `extractTableData()` pronađe validnu markdown tablicu u odgovoru AI-a. Funkcija traži linije koje počinju i završavaju s `|` — ali AI odgovor često sadrži:
- Tablice unutar code blokova (```)
- Linije s trailing razmacima koje ne završavaju točno s `|`
- Tekst pomješan između redaka tablice (prazan red prekida detekciju)
- Podatke formatirane kao liste umjesto tablica

Rezultat: gumbi se nikad ne prikažu jer parser ne prepoznaje tablicu.

Dodatno, `doc.save()` na mobilnim preglednicima može ne raditi — treba koristiti `blob` pristup za pouzdanije preuzimanje.

### Rješenje

#### 1. Robusniji parser tablica (`extractTableData`)
- Ignorirati code fence oznake (```)
- Dopustiti praznine između redaka tablice
- Trim trailing whitespace prije provjere `|`
- Podržati više tablica u jednom odgovoru (koristiti prvu pronađenu)

#### 2. Fallback izvoz kad nema tablice
- Kad AI odgovor sadrži strukturirane podatke (bullet liste s iznosima), ponuditi "Izvezi cijeli odgovor" gumb koji generira PDF od teksta poruke
- Uvijek prikazati barem gumb za PDF/print za svaki AI odgovor koji nije prazan

#### 3. Pouzdaniji PDF download na mobilnim uređajima
- U `exportToPDF` koristiti `Blob` + `URL.createObjectURL` umjesto `doc.save()` za bolju kompatibilnost
- Za `printTable`, dodati fallback ako `window.open` vrati null (popup blokiran)

### Datoteke za izmjenu

- **`src/components/FinancialAssistantDialog.tsx`**:
  - Popraviti `extractTableData()` — robusniji parsing
  - Dodati `exportResponseAsPDF()` — izvoz cijelog odgovora kao PDF teksta (fallback)
  - Popraviti `exportToPDF()` — Blob pristup za mobile
  - Popraviti `printTable()` — fallback za blokirane popupe
  - U `MessageBubble` — prikazati izvozne gumbe i kad nema tablice (fallback na tekst izvoz)

