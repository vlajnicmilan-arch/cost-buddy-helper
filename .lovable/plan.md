

## Popravci receipt sekcije

### Problemi
1. **Slika se otvara uvećano** — zoom počinje na `scale(1)` ali slika nema `max-width: 100%`, pa se prikazuje u punoj rezoluciji i izgleda uvećano
2. **"Podijeli / Spremi drugdje"** — `exportFile` na webu radi samo download, a na nativnom otvara share sheet. Korisnik ne vidi jasnu razliku. Treba razdvojiti na dva gumba: "Spremi na uređaj" (download) i "Podijeli" (share)
3. **"Pregledaj" gumb** treba premjestiti gore lijevo iznad slike umjesto ispod
4. **Tekst "Slika računa"** treba ukloniti (nepotreban label)

### Promjene u `TransactionDetailDialog.tsx`

1. **Ukloniti "Slika računa" tekst** (linije 514-523) — maknuti cijeli `div` s labelom i badge-om. Badge "Na uređaju" prebaciti da bude overlay na slici

2. **Premjestiti "Pregledaj" iznad slike** — mali gumb s `Eye` ikonom pozicioniran apsolutno gore lijevo na thumbnail-u

3. **Razdvojiti donji gumb na dva**:
   - "Spremi" — koristi `exportFile` za download/save
   - "Podijeli" — koristi `navigator.share` / native Share za dijeljenje

4. **Popraviti fullscreen viewer** — dodati `max-w-full` i `object-contain` na `<img>` unutar portala tako da slika stane u ekran umjesto da se prikazuje u punoj rezoluciji. Zoom 1 = slika stane u viewport

### Prijevodi
- Dodati ključeve `transactions.saveToDevice` i `transactions.share` u `hr.json`, `en.json`, `de.json`
- Ukloniti nekorišteni `transactions.shareOrExport`

### Rezultat
```text
┌─────────────────────────┐
│ 👁 [badge: Na uređaju] │  ← Eye gumb gore lijevo, badge gore desno
│                         │
│    [thumbnail slike]    │
│                         │
├─────────────────────────┤
│ [Spremi]    [Podijeli]  │  ← dva jasna gumba
└─────────────────────────┘
```

Fullscreen viewer: slika fitana u ekran, zoom 1 = cijela slika vidljiva.

