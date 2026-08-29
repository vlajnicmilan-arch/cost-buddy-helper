# Novi hero prodajne stranice

## Opseg
- Promijeniti samo prvi blok prodajne stranice i stilove nužne za njega.
- Sve postojeće sekcije, uključujući „Jedan projekt. Dva odvojena sjećanja.”, ostaviti riječ-po-riječ netaknute i pomaknuti ispod novog hero bloka.
- Ne mijenjati aplikaciju, backend, naplatu ni postojeću telemetrijsku infrastrukturu. Bez migracije.

## Novi prvi ekran
- Dodati logo CENTAR, zadani naslov, opis, CTA „Isprobaj besplatno” i doslovnu napomenu „Račun je besplatan. Bez roka i bez kartice.”
- CTA vodi na `/auth?mode=signup` i dobiva stabilnu oznaku `data-telemetry-target="hero_cta"`.
- Prilagoditi samo hero CSS tako da su logo, tekst, CTA i napomena vidljivi na 360×640 i 390×844, uz naznaku sljedećeg bloka na dnu viewporta.
- Dodati prijevode istog značenja za EN i DE bez novih tvrdnji.

## Snimka odmah ispod pregiba — blokirano sadržajem
- Postojeća snimka Pozdravnog ekrana (`shot3.webp`) sadrži osobno ime, stvarne nazive projekata i stvarne iznose. Ostale postojeće snimke također sadrže osobne ili poslovne podatke.
- Neću ih postaviti u novi javni blok niti izrađivati lažnu zamjenu, sukladno nalogu.
- Pripremiti strukturu i stil bloka „Iz aplikacije, ne iz prezentacije.” tek kad bude dostavljena odobrena neutralna WebP snimka postojećeg Pozdravnog ekrana. Do tada novi hero slijedi izravno postojeća neizmijenjena priča.

## Mjerenje i provjera
- Proširiti postojeći čitač CTA oznake tako da `data-telemetry-target` ima prednost pred tekstom gumba; bez promjene vrsta događaja, slanja ili baze.
- Dodati test da novi CTA daje `cta_click` s targetom `hero_cta`, uz postojeće testove `page_view`, `section_view`, `scroll_depth` i `time_on_page`.
- Provjeriti prikaz Playwrightom na 360×640 i 390×844 te potvrditi da CTA ne zahtijeva skrolanje.
- Nakon odobrenja i implementacije objaviti stranicu, zatim očitati točan živi `build-sha` i provjeriti događaj klika na objavljenoj inačici.
