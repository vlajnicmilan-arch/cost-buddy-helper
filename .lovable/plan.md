
## Problem

Aplikacija trenutno prikazuje pogrešnu poruku. Nije nužno da mikrofon stvarno nema dozvolu.

### Točan uzrok
U `useVoiceDictation.ts` sada se za Android aplikaciju koristi samo web prepoznavanje govora (`SpeechRecognition` / `webkitSpeechRecognition`), a svaka greška tipa `not-allowed` automatski otvara dijalog “dopustite mikrofon”.

Na Android aplikaciji to često znači jedno od ovoga:
1. WebView ne podržava taj način diktiranja kako očekujemo
2. Google speech servis u toj instanci ne starta iz WebView-a
3. runtime vraća generičku `not-allowed` grešku iako je sistemska dozvola već dana

Zato dobivaš lažnu poruku o dozvoli, iako je pravi problem u metodi diktiranja, ne u postavkama mikrofona.

## Rješenje

### 1. Vratiti ispravan put za Android aplikaciju
Za nativnu Android aplikaciju koristiti ugrađeni Capacitor speech plugin koji je već u projektu:
- `@capacitor-community/speech-recognition`

Za browser/web ostaviti Web Speech API.

Time ćemo imati:
- web/browser = web speech
- Android app = native speech recognition

To je stabilnije i ne ovisi o WebView ponašanju.

### 2. Prekinuti lažno prikazivanje “dopustite mikrofon”
U hooku promijeniti logiku grešaka tako da:
- stvarni problem s dozvolom pokazuje dozvolu
- nepodržan runtime / speech servis nedostupan pokazuje drugu, točniju poruku
- ako native plugin nije dostupan, ne glumiti da je problem korisnikova dozvola

### 3. Dodati runtime fallback bez novog APK obećanja unaprijed
Implementirati redoslijed:
1. Ako je nativna aplikacija, pokušaj native speech plugin
2. Ako native plugin nije dostupan u runtimeu, pokušaj web speech samo gdje stvarno radi
3. Ako ni jedno ne radi, prikaži jasnu poruku da glasovni unos nije dostupan u toj instalaciji, umjesto poruke o mikrofonu

Tako korisnik barem dobiva točnu informaciju, a ne beskonačnu petlju s dozvolama.

### 4. Poboljšati poruke korisniku
Dodati odvojene poruke:
- “mikrofon blokiran”
- “glasovni unos nije dostupan u ovoj aplikaciji”
- “speech servis nije pokrenut, pokušaj u Chrome pregledniku”

To će biti puno jasnije i manje frustrirajuće.

## Datoteke za izmjenu

| Datoteka | Promjena |
|---|---|
| `src/hooks/useVoiceDictation.ts` | Razdvojiti native i web diktiranje, koristiti Capacitor speech plugin na Androidu, precizniji error handling |
| `src/components/VoiceInputButton.tsx` | Prikazati točniji dijalog o grešci ovisno o tipu problema |
| `src/components/projects/DailyStandupSheet.tsx` | Uskladiti isti novi error/status model jer koristi isti hook |
| `src/i18n/locales/hr.json` | Dodati nove tekstove za “nije podržano”, “servis nedostupan”, “otvori u Chromeu” |
| `src/i18n/locales/en.json` | Isto |
| `src/i18n/locales/de.json` | Isto |

## Tehnički detalji

- Projekt već ima dependency `@capacitor-community/speech-recognition`, ali se trenutno ne koristi u `src`.
- To znači da je najlogičnije rješenje vratiti nativni speech path za Android umjesto forsiranja Web Speech API-ja u WebView-u.
- Hook treba imati dva enginea:
  - native engine: `start`, `stop`, partial results, permission check/request preko plugina
  - web engine: postojeći `SpeechRecognition`
- Error mapping treba razlikovati:
  - permission denied
  - unsupported
  - service unavailable
  - aborted/no speech
- UI treba koristiti iste i18n ključeve i ne hardkodirati tekst.

## Očekivani ishod

- Ako je problem samo u krivoj metodi diktiranja, glasovni unos će proraditi bez lažne poruke o dozvoli.
- Ako trenutna instalirana Android aplikacija nema aktivan native speech dio u sebi, aplikacija će barem prestati lagati da je problem dozvola i pokazat će točan razlog.
- Ako native plugin jest prisutan u toj instalaciji, rješenje može proraditi bez novog APK-a kroz Live Sync.
- Ako plugin nije prisutan u toj konkretnoj već instaliranoj verziji, tada će tek to biti stvarni razlog za novi build — ali to ćemo znati točno, umjesto da nagađamo o mikrofonu.
