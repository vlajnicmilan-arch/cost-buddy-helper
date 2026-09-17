# C — ZIP originala uz mjesečni paket za knjigovođu

Uz PDF i Excel pregled (B), korisnik može preuzeti i ZIP s originalnim dokumentom
svakog računa iz tog istog paketa. Nazivi datoteka poklapaju se s popisom u pregledu.

## Zaključak provjere: C je izvediv s onim što se već čuva

Provjereno u kodu i u bazi:

- Ulazni računi dolaze s dva puta. eRačun XML uvoz (105 redaka, svi s `import_batch_id`) —
  ti su ionako izvan paketa (FINA pravilo iz B). Mail-put: 66 redaka bez `import_batch_id`.
- Za svih 66 mail-računa postoji veza do originala: `document_links`
  (`target_type = 'incoming_invoice'`, `target_id` = račun) → `document_ingest_items` →
  `inbound_attachments.storage_path`, datoteka u privatnom spremniku `inbound-mail`.
  Pokrivenost je 66/66 — nijedan račun iz paketa nema „nema originala".
- Svi ti privici su PDF (`mime_sniffed = 'pdf'`, 56 s deklariranim `application/pdf`);
  u cijelom spremniku trenutno nema nijedne slike (99 pdf, 3 xml, 1 zip, 6 nepoznato).
  Datoteke se ne brišu nakon obrade (370 objekata, od 9. kolovoza do danas).
- Korisnik svoje privitke smije čitati izravno s klijenta — RLS politika
  „Users read own inbound mail objects" na `storage.objects` dopušta `SELECT` kad je prvi
  segment putanje njegov `auth.uid()`.

Dakle: **ništa novo ne treba spremati, ne dira se tijek unosa ni scanner.** ZIP se slaže
klijentski od postojećih PDF-ova.

Jedna iskrena posljedica te provjere: **korak čišćenja slike danas nema ulaza.** Fotke s
telefona idu kroz scanner u troškove (`receipts`), ne u ulazne račune; račun postane ulazni
račun samo kroz eRačun XML ili mail. Slika bi u paket ušla tek kad netko pošalje fotografiju
na mail-adresu. Zato se čišćenje gradi kao put koji se **uključi kad slika stvarno dođe**
(vidi dolje), a ne kao glavni dio posla — bez izmišljanja novog toka unosa.

## Što radi gumb

Na traci „Predaja knjigovodstvu" (`HandoverBar`) dolazi treći gumb **ZIP originala**, uz
PDF i Excel. Isti skup računa (`selectHandoverInvoices`, ista tvrtka i mjesec), isti redoslijed.

Naziv datoteke u zipu = redni broj iz pregleda + dobavljač + iznos, npr.
`03 - Konzum d.d. - 124,50.pdf`; naziv se čisti od znakova koje datotečni sustav ne trpi,
duplikati dobivaju sufiks. Sam zip: `predaja-knjigovodstvu-<tvrtka>-<YYYY-MM>.zip`
kroz postojeći `buildReportFileName`.

Uz dokumente ide i `popis.txt` (isti redci i nazivi kao u pregledu) da knjigovođa odmah
vidi što je u paketu.

## Obrada po računu

1. **Original je PDF** (današnji slučaj) — uzima se kakav jest, bez ponovne obrade,
   samo se preimenuje.
2. **Original je slika** — čisti se u sken i pretvara u PDF (jedna stranica).
3. **Više privitaka istog računa** — spajaju se u jedan višestranični PDF (slike kao
   stranice; ako su i PDF-ovi, spajaju se redom kroz `pdf-lib` samo ako je potrebno —
   inače se uzima prvi PDF i ostali se navode u popisu).

### Čišćenje slike — klijentski, bez AI i bez teške knjižnice

Sve na `<canvas>`, u jednoj novoj čistoj datoteci `src/lib/eracun/scanCleanup.ts`:

1. smanjenje na najviše ~2000 px po duljoj stranici,
2. siva slika + procjena pozadine kliznim prozorom (lokalni prosjek) → dijeljenje slike
   pozadinom, čime nestaju sjene i neravnomjerno svjetlo,
3. nalaženje ruba računa: rubovi po redcima/stupcima (gdje prestaje pozadina) → izrez
   pravokutnika s malom marginom; ako rub nije pouzdan, izrez se preskače i slika ostaje cijela,
4. zadano **crno-bijelo** (lokalni prag, Sauvola-stil nad istim prozorom), **siva** kao opcija,
5. rezultat → JPEG/PNG → stranica u PDF-u kroz postojeći `jspdf` (`addImage`).

Bez novih knjižnica, bez WASM-a, bez AI poziva. Teške petlje rade nad umanjenom slikom,
pa je obrada reda desetinke sekunde po fotografiji.

### ZIP

Postojeći **`jszip`** (već u `package.json`, ^3.10.1), klijentski, lijeni `import()`.
Spremanje kroz postojeći `fileExport.ts` (radi i u nativnoj ljusci), isto kao PDF/Excel u B.

## Greške i izvještaj korisniku

Paket se uvijek složi za ostale račune. Za svaki problematičan račun:

- nema poveznice na original ili datoteka se ne može preuzeti → redak u popisu
  „bez originala — provjeri",
- obrada slike padne → original se stavlja u zip **neobrađen** i redak ide u
  „neuspjela obrada — provjeri".

Na kraju: prevedena poruka s brojem uključenih i brojem problematičnih računa (nikad
generička), a svaki pad se zapisuje u `app_diagnostics_logs` (radnja
`accounting_handover_zip.buildEntry`, id računa, doslovan `code`/`message`, build žig)
kroz postojeći `logDiagnostic` + `describeDbError`. Popis problematičnih računa ide i
u `popis.txt` u zipu.

## Tehnički dio

Nove datoteke:
- `src/lib/eracun/handoverOriginals.ts` — čiste funkcije: `originalFileName(row, index)`
  (čišćenje naziva, razrješenje duplikata), `planZipEntries(rows, links)`,
  `classifyOriginal(mime, path)` (pdf / slika / nepoznato).
- `src/lib/eracun/scanCleanup.ts` — čišćenje slike (canvas), `cleanScanToImage`,
  s čistim pod-funkcijama nad nizovima piksela radi testiranja.
- `src/lib/eracun/handoverZipExport.ts` — dohvat originala (`document_links` →
  `document_ingest_items` → `inbound_attachments`, download iz `inbound-mail`),
  obrada, `jszip`, spremanje kroz `fileExport`.
- `src/hooks/useInvoiceOriginals.ts` — čitanje poveznica original ↔ račun za skup računa.
- Testovi: nazivi datoteka i duplikati, plan zip unosa, razvrstavanje PDF/slika,
  pragovi i izrez nad malim sintetičkim nizom piksela, ponašanje kad originala nema.

Dirano uz to: `HandoverBar.tsx` (treći gumb i poruka o rezultatu), i18n `hr/en/de`
(`eracun.handover.zip.*`). **Bez migracije** — ne dodaje se nijedno polje ni tablica.

## Izvan opsega — ne dira se

Mail knjigovođi, mjesečni pregled B osim dodanog gumba, F1/F2 logika (samo se čita),
scanner i tijek unosa troška, motor salda i anchor, `expenses`, uvoz izvoda, dedup/otisak,
owner-loan, RLS politike, atribucija troška, `client.ts`, `.env`. Ne objavljuje se.
