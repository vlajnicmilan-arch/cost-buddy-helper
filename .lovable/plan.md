
Cilj: maknuti lažnu poruku “nema pristup mikrofonu” i prikazati stvarni problem

1. Potvrđeni uzrok
- Tvoja screenshot potvrđuje da je Android dozvola za mikrofon već uključena.
- Trenutni kod u `src/hooks/useVoiceDictation.ts` i dalje tumači Web Speech grešku `not-allowed` kao “mikrofon blokiran”.
- U Android aplikaciji to često nije prava zabrana mikrofona, nego kvar ili ograničenje samog govornog enginea unutar WebView-a.
- Zato aplikacija opet vrti krivu poruku i šalje te u Postavke iako je tamo sve već ispravno.

2. Što ću promijeniti
- U `src/hooks/useVoiceDictation.ts` promijeniti klasifikaciju grešaka tako da se na Android aplikaciji:
  - više ne prikazuje “mikrofon blokiran” samo zato što je došao `not-allowed`
  - takve greške tretiraju kao “glasovni servis nije dostupan u ovoj instalaciji / ovom runtimeu”
- Zadržati Web Speech put koji je prije radio, ali prestati lagati da je problem u dozvoli.

3. Preciznija provjera prije poruke
- Dodati nenametljivu provjeru stanja dozvole gdje je dostupna (`Permissions API`), bez novog popup-a za mikrofon.
- Ako provjera stvarno kaže “denied”, tada prikazati uputu za dozvole.
- Ako provjera nije dostupna ili kaže da dozvola nije problem, prikazati poruku da je problem u voice engineu, ne u tvojim postavkama.

4. Popravak korisničkog sučelja
- U `src/components/VoiceInputButton.tsx` promijeniti dijalog da prikazuje:
  - stvarnu poruku o blokiranom mikrofonu samo kad je to potvrđeno
  - novu poruku tipa “Glasovni unos trenutno nije dostupan u ovoj aplikaciji”
- U `src/components/projects/DailyStandupSheet.tsx` uskladiti istu logiku, da nema dvije različite i kontradiktorne poruke.

5. Dodati jasne poruke
- U `src/i18n/locales/hr.json`, `en.json`, `de.json` dodati/izmijeniti tekstove:
  - “Dozvola za mikrofon na uređaju je uključena, ali se servis za diktiranje nije mogao pokrenuti.”
  - “Pokušaj u Chrome pregledniku.”
  - “Ako se ovo nastavi pojavljivati u instaliranoj aplikaciji, problem je u toj verziji aplikacije, ne u tvojim dozvolama.”

6. Dodati dijagnostiku za sljedeći korak
- U hook dodati `console.log` za:
  - platformu (web / Android app)
  - dostupnost `SpeechRecognition`
  - sirovi `onerror` kod (`not-allowed`, `service-not-allowed`, `audio-capture`, itd.)
  - rezultat provjere dozvole ako je dostupan
- To će omogućiti da nakon idućeg pokušaja vidim točan razlog, umjesto nagađanja.

7. Očekivani rezultat nakon ove promjene
- Aplikacija te više neće bespotrebno vraćati na “dopusti mikrofon” kad je dozvola već uključena.
- Dobit ćeš točniju poruku: je li problem stvarna dozvola ili to da voice engine u toj instaliranoj aplikaciji ne starta.
- Ako nakon toga poruka bude “servis nije dostupan”, znat ćemo sigurno da više nije problem u postavkama nego u samom runtimeu aplikacije.

Datoteke za izmjenu
- `src/hooks/useVoiceDictation.ts`
- `src/components/VoiceInputButton.tsx`
- `src/components/projects/DailyStandupSheet.tsx`
- `src/i18n/locales/hr.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/de.json`

Tehnički detalji
- Trenutni hook koristi samo `SpeechRecognition` / `webkitSpeechRecognition`.
- MDN i Chrome dokumentacija potvrđuju da Web Speech radi preko online servisa i može vratiti generičke greške.
- Android WebView dozvole i Web Speech ponašanje nisu isto što i sistemska Android dozvola.
- Zbog toga je glavni bug sada u krivom mapiranju grešaka, ne nužno u samom mikrofonu.

Ako nakon ove promjene i dalje ne bude radilo, idući korak će biti jasan:
- ili otvoriti glasovni unos samo u Chromeu za instaliranu verziju
- ili napraviti novi native build s pravim nativnim speech putem, ali tek ako dijagnostika potvrdi da je to stvarni uzrok
