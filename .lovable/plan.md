

## Problem: Diktiranje se prekida prije kraja rečenice

### Uzroci

1. **Web Speech API (Chrome/Edge u browseru)** automatski staje nakon ~1-2 sekunde tišine između riječi. Kad si rekao *"...na katu i u..."* napravio si malu pauzu razmišljajući → recognizer je odlučio da si gotov i odsjekao završetak.

2. **Buffer logike u `VoiceInputButton`** — kad se recognizer auto-restarta nakon prekida, **partial transcript** novog ciklusa može pregaziti tekst koji još nije bio označen kao "final". Tako "u prizemlju" ne stigne biti spremljeno prije nego što novi `start()` resetira interim buffer.

3. **Native (Android) plugin** ima sličan problem: Google Speech API na Androidu prekida snimanje nakon ~5s tišine i naša auto-restart logika gubi kontinuitet jer se `partialResults` resetira na svaku novu sesiju.

---

### Rješenje

#### 1. Pojačati toleranciju na pauze (web)
- Postaviti `continuous = true` (već je) i **dodati timer** koji ignorira `onend` ako je manji od 800ms od zadnjeg govora — restartati odmah bez gubljenja teksta.
- Pratiti **timestamp zadnjeg `onresult`** događaja i ignorirati prerane prekide.

#### 2. Pravilno spremati interim transcript pri restartu
- U `useVoiceDictation` dodati internu varijablu `accumulatedFinalText` koja zadržava sav final tekst kroz više ciklusa.
- Pri auto-restartu (nakon prekida) **prebaciti zadnji interim transcript u final** prije nego što se nova sesija pokrene → ništa se ne gubi.

#### 3. Vizualni indikator + ručna kontrola
- Dodati **brojač sekundi snimanja** ispod mikrofona (npr. *"00:14"*) da korisnik vidi da snimanje teče.
- Dodati **diskretnu poruku** *"Pauziraj govor — automatski nastavlja"* kad detektira tišinu >2s, da korisnik zna da može nastaviti.
- Po isteku **30s neaktivnog snimanja** automatski stati (zaštita od beskonačne sesije).

#### 4. Testna provjera nakon promjene
- Promjena zahtijeva **rebuild nativne aplikacije** (`npx cap sync android`) za testiranje na Androidu.
- U browseru (Chrome) radi odmah nakon spremanja koda.

---

### Datoteke koje će se mijenjati

| Datoteka | Promjena |
|---|---|
| `src/hooks/useVoiceDictation.ts` | Akumulator finalnog teksta, robusniji auto-restart, timestamp tracking |
| `src/components/VoiceInputButton.tsx` | Brojač vremena, vizualna poruka o auto-restartu |
| `src/i18n/locales/hr.json` (+en, de) | Novi prijevodi: `voice.continuing`, `voice.timer` |

---

### Očekivani ishod

- Možeš diktirati cijelu rečenicu *"Lijepi se pločica na katu i u prizemlju"* bez prekida — čak i ako napraviš pauzu od 2-3 sekunde između *"u"* i *"prizemlju"*.
- Tekst koji si već izgovorio **nikad se ne gubi** ni pri auto-restartu.
- Vidiš vizualno (brojač + poruka) da snimanje teče.
- Maksimalno trajanje jedne sesije: **30 sekundi** (dovoljno za nekoliko rečenica).

