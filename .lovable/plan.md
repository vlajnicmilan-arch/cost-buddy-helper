

## Vraćanje na radnu verziju diktiranja

### Što je problem

Tvoja originalna instalirana aplikacija **nikad nije imala nativni speech plugin** ugrađen — radila je isključivo preko **Web Speech API-ja** unutar Android WebView-a. To je radilo, samo s ograničenjem kratkih sesija (što je normalno ponašanje Web Speech API-ja).

Ja sam u međukoracima dodao kod koji forsira nepostojeći nativni plugin → Android pokrene sistemski speech intent (čuje se beep), ali rezultat se ne vrati u JavaScript jer plugin nije ugrađen u APK.

### Što ću napraviti

**1. Ukloniti nativnu granu iz `useVoiceDictation.ts`**
- Maknuti sav kod koji import-a `@capacitor-community/speech-recognition`
- Maknuti `startNative`, `stopNative`, `nativePluginAvailable` probe
- Ostaviti samo Web Speech API put (`startWeb`) — koji je radio i u browseru i u tvojoj Android aplikaciji

**2. Zadržati dobre stvari iz dosadašnjeg rada**
- Kontinuirano slušanje s auto-restartom (`r.onend → r.start()`) — ovo je bilo dodano da rješava prekid nakon pauze
- Brojač sekundi i max 30s sesija
- "Slušam, nastavi govoriti" indikator
- Akumulirani transcript (ne gubi se tekst kod auto-restarta)
- Razlikovanje grešaka (`permission-denied`, `service-unavailable`, `unsupported`)

**3. Ukloniti `engine: 'native' | 'web' | 'none'` koncept**
- `VoiceInputButton.tsx` i `DailyStandupSheet.tsx` više ne ovise o tome — postoji samo jedan engine

**4. Ne dirati `package.json`**
- Plugin može ostati kao dependency (neškodljiv) — ne želimo trigger novog APK builda

### Datoteke za izmjenu

| Datoteka | Promjena |
|---|---|
| `src/hooks/useVoiceDictation.ts` | Ukloniti native granu, zadržati samo Web Speech API + akumulator + auto-restart |
| `src/components/VoiceInputButton.tsx` | Ukloniti reference na `engine` ako postoje |
| `src/components/projects/DailyStandupSheet.tsx` | Isto, uskladiti s pojednostavljenim hookom |

### Što ovo znači za tebe

- **Bez novog APK-a** — vraćamo se na kod koji već radi u tvom instaliranom WebView-u
- **Bez troškova**
- Diktiranje će raditi **kao prije** — možeš diktirati, čak i s pauzom (auto-restart radi posao)
- Lažna poruka o dozvoli nestaje jer više ne pokušavamo nepostojeći nativni plugin

### Što neće biti idealno

- Ako napraviš jako dugu pauzu (>5s), Web Speech API može završiti sesiju i auto-restart pokrene novu — kratki "prekid" u slušanju je moguć (ali tekst se ne gubi, akumulira se)
- iPhone Safari i dalje ne podržava — to je Apple ograničenje

