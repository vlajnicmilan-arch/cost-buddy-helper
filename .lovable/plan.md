# Plan: mail-lijevak bez tihog nestajanja

## Potvrđeno početno stanje

- Poruke `1af7ee77…` (`message/rfc822`) i `2c5da275…` (`text/html`) imaju privitak u `karantena/nepodrzan_tip`, ali nemaju nijednu `document_ingest_items` stavku ni obavijest.
- „Fwd: Račun Grad Osijek” ima siguran PDF i čitljiv financijski sadržaj, ali je završio kao `nepoznato + mozda_izvod`, a odgovor „nije izvod” postavio je jedinu stavku u `odbacio_korisnik`.
- Gmail verifikacijske stavke danas imaju samo `na_pregledu/odbacio_korisnik`; klik na vanjski link ne mijenja stanje.

## Što će se izgraditi

### 1. Vidljiva kartica za korisnički popravljiv nepodržani privitak

- Kad MIME provjera odbije format kao `nepodrzan_tip` ili `arhiva_nije_podrzana`, `mail-process` će idempotentno stvoriti posebnu stavku `na_pregledu` s deklariranim/stvarnim tipom, jasnom porukom da dokument treba poslati kao PDF i postojećom `mail_document_pending` obavijesti.
- Kartica neće nuditi obradu sadržaja; imat će samo izričiti „Odbaci”.
- Sigurnosni razlozi temeljeni na sadržaju, npr. zabranjeni XML DTD/entiteti i budući malware-signali, ostaju u sigurnosnoj karanteni bez kartice. Razdvajanje će biti eksplicitna allowlista korisnički popravljivih razloga, a ne opće pravilo „svaka karantena je vidljiva”.

### 2. Raskrižje umjesto destruktivnog „nije izvod”

- Kartica `mozda_izvod/nepoznato` dobit će četiri odvojene odluke:
  1. „Ovo je izvod” — postojeći prisilni izvod/reprocess put.
  2. „Ovo je račun” — trajno pamti korisnikovu klasifikaciju, vraća poruku u obradu i prisiljava postojeći AI račun-put za dopunu polja.
  3. „Nešto drugo — zadrži” — premješta stavku u nedestruktivno stanje `zadrzano`, vidljivo u „Primljeno”, bez aktivne obavijesti.
  4. „Odbaci” — jedini put u `odbacio_korisnik`, vizualno odvojen od triju klasifikacijskih odluka.
- Odluke će ići kroz vlasnički provjerene RPC-e, tako da se statusi i prisilna klasifikacija ne mogu krivotvoriti za tuđu stavku.

### 3. Prednost jasnog računa bez regresije izvoda i promocija

- Potvrđeni jaki izvodi ostaju prvi veto i ne idu u AI račun-put.
- Ako postoji financijska supstanca i jasan signal `račun/invoice/faktura`, slabi „možda izvod” signal više neće odmah otvoriti izvod-pitanje: stavka ide u postojeću AI klasifikaciju/dopunu računa.
- Promidžbene poruke bez financijske supstance i postojeći jaki bankovni/kartični izvodi ostaju na sadašnjim putovima.
- Korisnički odabir „Ovo je račun” bit će mjerodavan i pri reprocessu; stroj ga neće vratiti na izvod-pitanje.

### 4. Gmail potvrda: tri stanja

- Klik „Otvori potvrdu” sinkrono otvara postojeći, već sigurnosno provjeren Google URL i bilježi klik; stavka prelazi iz `na_pregledu` u `ceka_prvi_mail`. Time postojeći DB okidač odmah gasi obavijest i broj stavki pada.
- `ceka_prvi_mail` bit će prikazan u „Primljeno” posebnom verifikacijskom karticom, ne kao prazan račun. „Odbaci” ostaje dostupan.
- Novi stvarni mail primljen nakon klika, čiji se točno izdvojeni pošiljatelj podudara s `forwardedAddress` iste korisnikove čekajuće potvrde, trajno zatvara potvrdu u završno stanje. Neće se zaključivati po subjectu ni djelomičnom tekstu adrese.
- Dnevni DB cron jednom vraća stavku stariju od 7 dana u `na_pregledu`, dodaje upozorenje „S ove adrese još ništa nije stiglo…” i stvara jednu novu pending obavijest. Jednokratnost će čuvati zaseban timestamp/oznaka reaktivacije.
- Vanjski link se nikad ne poziva automatski.

### 5. „Primljeno”, i18n i odbačene posebne stavke

- „Primljeno” će prikazivati `zadrzano` i `ceka_prvi_mail` kao semantičke kartice, uz postojeći popis poruka.
- Posebne klasifikacije u odbačenom popisu dobit će vlastiti opis umjesto lažnih praznih polja računa.
- Svi novi tekstovi i kontrole bit će u HR/EN/DE uz postojeće i18n čuvare.

## Baza i tehnički zahvati

- Migracija će proširiti dopuštena stanja stavke te dodati minimalna polja za klik/čekanje/jednokratni sedmodnevni povrat. RLS i postojeće vlasništvo ostaju mjerodavni.
- Postojeće DB funkcije mijenjat će se isključivo od svojih živih `pg_get_functiondef` definicija.
- Dodat će se vlasnički RPC za odluke raskrižja i funkcija dnevnog održavanja Gmail čekanja; cron će pozivati DB funkciju bez novog klijentskog tajmera.
- `mail-process` ostaje jedini klasifikacijski worker i postojeći notification helper/obrazac ostaje jedini način stvaranja pending obavijesti.
- `package.json` i sva tri lockfilea neće se dirati.

## Testovi i isporuka

- Regresije: vidljiva popravljiva karantena + obavijest; sigurnosna karantena bez kartice; sva četiri izlaza raskrižja; samo izričiti „Odbaci” odbacuje; jaki izvodi i promocije ostaju netaknuti; invoice signal ide u AI račun-put; Gmail klik/čekanje/prvi mail/7 dana/jednokratnost/odbacivanje; notification samogašenje; HR/EN/DE paritet.
- Pokrenuti ciljane Vitest/Deno testove i `tsgo`; zatim deployati samo zahvaćene funkcije.
- Nakon deploya reprocessati isključivo živu stavku Grad Osijek kroz novi račun-put te dokazati u bazi: status `na_pregledu`, klasifikacija `racun`, pročitana polja, obavijest i bez duplikata.
- Objaviti klijent, zabilježiti točan prethodni i novi produkcijski žig te verificirati novi Vite asset/sadržaj, ne `version.json`.
- Završni izvještaj navest će izmijenjene datoteke, migraciju/funkcije, testove, deploy/objavu, žive DB dokaze bez osjetljivih sadržaja te potvrdu da lockfileovi nisu dirani.

## Jedna ranije prijavljena stavka

Kvar od 16.8. je da „Odbačeno” sve posebne stavke (npr. Gmail potvrdu) renderira kao račun pa pokazuje prazne broj/iznos; ovaj plan ga popravlja samo za posebne klasifikacije zahvaćene ovim nalogom.