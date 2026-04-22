

## Problem: Mikrofon traži dozvolu iako je već dodijeljena

### Uzrok

Na Androidu postoje **dvije razdvojene razine dozvola** za mikrofon:

1. **Sistemska Android dozvola** — onu si već dao aplikaciji ✅
2. **WebView dozvola** — Android WebView (u koji je tvoja Live Sync app pakirana) traži **zasebnu dozvolu** kad web stranica unutar njega zatraži mikrofon preko `getUserMedia()`. Po defaultu, WebView **automatski odbija** ovaj zahtjev osim ako se ručno ne implementira `onPermissionRequest` u nativnom Java/Kotlin kodu.

Dodatno, moj kod u `useVoiceDictation.ts` poziva `navigator.mediaDevices.getUserMedia({ audio: true })` **prije** pokretanja Web Speech API-ja — to izaziva dijalog koji WebView odbija, a zatim prikazujemo poruku "Dopustite pristup mikrofonu" iako je sve u redu.

**Kvaka:** Web Speech API (`webkitSpeechRecognition`) **ne treba** `getUserMedia` poziv — on interno upravlja mikrofonom kroz Google servise. Pre-provjera je suvišna i kontraproduktivna na Android WebViewu.

---

### Rješenje (bez novog APK-a)

#### 1. Ukloniti `getUserMedia` pre-provjeru iz `useVoiceDictation.ts`
- Web Speech API sam zatraži mikrofon kad pokrene `recognition.start()`.
- Dijalog za dozvolu se onda rješava kroz `onerror` event s tipom `not-allowed` ili `service-not-allowed` (već imamo handler).
- Time se eliminira "duplo traženje" koje WebView odbija.

#### 2. Bolja diferencijacija grešaka
- Ako `onerror` vrati `not-allowed`, prikazati jasniju poruku s instrukcijama specifičnima za Android:
  > *"Mikrofon nije dostupan. Provjerite da je dozvola za mikrofon uključena u Postavkama → Aplikacije → V&M Balance → Dozvole → Mikrofon."*
- Dodati i napomenu o WebView dozvoli kad se otkrije Android okruženje.

#### 3. Detekcija Android WebView okruženja
- Ako smo u Capacitor Android WebView-u i `getUserMedia` nije dostupan ili odbijen, **ipak pokušati** pokrenuti Speech Recognition direktno — često radi jer Google Speech ide preko sistemskog servisa, ne kroz WebView mikrofon.

---

### Datoteke koje će se mijenjati

| Datoteka | Promjena |
|---|---|
| `src/hooks/useVoiceDictation.ts` | Ukloniti `getUserMedia` pre-provjeru, oslanjati se na `onerror` Speech API-ja |
| `src/i18n/locales/hr.json` (+en, de) | Jasnija poruka o dozvoli s Android-specifičnim uputama |

---

### Što ovo znači za tebe

- **Bez novog APK-a** — sve ide preko Live Sync
- **Bez troškova** — i dalje besplatan Web Speech API
- Diktiranje će raditi u postojećoj aplikaciji čim se promjena spremi
- Ako i dalje ne radi nakon promjene, znat ćemo da je problem dublje (u nativnom WebView konfiguraciji koja **bi** zahtijevala novi APK) — ali prvo probajmo ovo lakše rješenje

