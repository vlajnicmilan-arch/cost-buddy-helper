Plan je da ovo riješimo na razini stvarnog toka skeniranja, bez novog paralelnog business skenera.

1. Popraviti kontekst gumba “Skeniraj” i “Dodaj” na home dashboardu
- Trenutno gumbovi iz headera otvaraju globalni skener s `businessProfileId: null`, iako je korisnik prebačen na chip tvrtke.
- Promjena: `HomeHeader` će dobiti trenutni aktivni `businessProfileId` i proslijediti ga u `ScanTriggerButton` i `ManualAddTriggerButton`.
- Rezultat: klik na “Skeniraj” u chipu tvrtke odmah otvara kameru, ali skener zna da sprema u poslovnom kontekstu.

2. Uskladiti automatski sken s ručnim “Dodaj → Fotografiraj” tokom
- Iz dijagnostike se vidi da auto-sken često kreće s `payment_sources_count: 0`, dok ručni tok dođe do 8 izvora i zato bolje prepozna izvor plaćanja.
- Promjena: auto-sken neće krenuti dok nisu učitani izvori plaćanja za aktivnu tvrtku + osobni izvori. Ne uvodim timeout; koristim isti izvor podataka koji već radi u ručnom toku.
- Rezultat: “Skeniraj” i “Dodaj → Fotografiraj” koriste iste podatke za prepoznavanje kartice/računa.

3. Ispraviti format spremljenog izvora plaćanja
- U bazi postoji miješanje `custom:UUID` i čistog `UUID`, a filteri i lookup logika očekuju konzistentno ponašanje.
- Promjena: kad se odabere ili prepozna prilagođeni izvor, spremat će se dosljedno kao `custom:UUID`, a postojeći prikaz/filtri će i dalje čitati oba formata gdje je potrebno.
- Rezultat: osobni izvor se pouzdano prepozna kao osobni, a poslovni kao poslovni.

4. Učiniti pozajmicu vlasnika pouzdanom i vidljivom
- Ako se poslovni trošak plati osobnim prilagođenim izvorom, nakon spremanja mora nastati zapis u `business_debts` kao “Pozajmica vlasnika”.
- Promjena: nakon spremanja čekamo owner-loan kreiranje prije zatvaranja/refetcha, tako da zapis ne ostane “fire-and-forget” nevidljiv.
- Ako se zapis pozajmice ne može kreirati, korisnik će dobiti grešku umjesto dojma da je sve spremljeno.
- Rezultat: u osobnom prikazu transakcija ostaje vidljiva kao osobni trošak, a u tvrtki postoji zapis pozajmice vlasnika.

5. Dodati jasnu oznaku u pregledu prije spremanja
- U previewu skeniranog računa, kad je odabran osobni izvor u poslovnom kontekstu, prikazat će se i18n oznaka “Bit će evidentirano kao pozajmica vlasnika”.
- Time korisnik vizualno vidi prije spremanja što će se dogoditi.

6. Provjera duplikata ostaje aktivna u poslovnom toku
- Provjerit ću da se `checkDuplicate` poziva s finalnim tipom, iznosom, datumom, kategorijom i trgovcem nakon što se ispravno postavi business kontekst.
- Ako je potrebno, dodatno ću proširiti logiku da duplikat prepozna i kad postoje varijacije `custom:UUID`/`UUID` u izvoru plaćanja.

Tehnički detalji:
- Datoteke: `HomeHeader.tsx`, `PersonalModeView.tsx`, `AddExpenseDialog.tsx`, `ScannedDataPreview.tsx`, `useExpenseCRUD.ts`, po potrebi `useExpenseFetch.ts`/`TransactionItem.tsx` za kompatibilnost formata izvora.
- Bez nove tablice i bez promjene dogovorenog modela: jedna transakcija ostaje u `expenses`; poslovni zapis je `business_debts` kao pozajmica vlasnika.
- Bez dupliciranja scanner logike: koristimo postojeći globalni `AddExpenseDialog` i isti `useReceiptScanner` tok.