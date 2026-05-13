# 🔐 KEYSTORE BACKUP — KRITIČNO

## Što je keystore i zašto je važan

Android APK datoteke su **digitalno potpisane** keystoreom. Ako se potpis između dvije verzije razlikuje, **Android odbija instalirati update** i korisnik mora deinstalirati app (i izgubiti SVE lokalne podatke: PIN, slike koje nisu uploadane, sve što nije u cloudu).

**Bez ovog keystorea ne možeš ažurirati niti jednog postojećeg korisnika.**

---

## Trenutni release keystore

| Parametar | Vrijednost |
|-----------|------------|
| File | `vmbalance-release.jks` |
| Alias | `vmbalance` |
| Algoritam | RSA 2048 |
| Validity | 10000 dana |
| Lokacija | **NIJE u repou** — držiš ga lokalno + backup |

**Lozinke** (storepass i keypass) — drži ih u password manageru, NIKAD u repou.

---

## Gdje se keystore koristi

APK se gradi GitHub Actions workflowom (`.github/workflows/android-build.yml`) koji čita 4 GitHub Secreta:

| Secret | Sadržaj |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | base64-encoded sadržaj `vmbalance-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | storepass |
| `ANDROID_KEY_ALIAS` | `vmbalance` |
| `ANDROID_KEY_PASSWORD` | keypass (obično isto kao storepass) |

Postavljeni su u: **GitHub repo → Settings → Secrets and variables → Actions**.

`android/app/build.gradle` (linije 19-37) automatski potpisuje release build kad su env varijable prisutne.

---

## ✅ Backup checklist (NAPRAVI ODMAH)

Backup `vmbalance-release.jks` (cca 2-3 KB) na **minimalno 2 mjesta**:

- [ ] USB stick (fizički, drži ga odvojeno od računala)
- [ ] Password manager s file attachmentom (1Password, Bitwarden Premium)
- [ ] Privatan cloud folder (Google Drive / OneDrive / iCloud, kriptiran zip)
- [ ] Vanjski disk

Uz svaki backup zapiši (u password manageru, ne u istom folderu kao file):
- Storepass
- Keypass
- SHA-1 fingerprint (vidi dolje za verifikaciju)

---

## Generiranje novog keystorea (samo prvi put)

```bash
keytool -genkeypair -v \
  -keystore vmbalance-release.jks \
  -alias vmbalance \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass <JAKA_LOZINKA> \
  -keypass <JAKA_LOZINKA>
```

Zatim base64-encode:

```bash
# macOS / Linux
base64 -i vmbalance-release.jks -o vmbalance-release.jks.b64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("vmbalance-release.jks")) `
  | Out-File vmbalance-release.jks.b64
```

Sadržaj `.b64` filea zalijepi u GitHub Secret `ANDROID_KEYSTORE_BASE64`.

---

## Verifikacija (SHA-1 fingerprint)

Iz keystorea:
```bash
keytool -list -v -keystore vmbalance-release.jks \
  -alias vmbalance -storepass <LOZINKA>
```

Iz potpisanog APK-a:
```bash
keytool -printcert -jarfile vmbalance-X.Y.Z.apk
```

Oba moraju vratiti **identičan SHA-1 fingerprint**. Zapiši ga uz backup — ako se ikad nađeš s više keystoreova, znaš koji je pravi.

---

## 🚨 Ako izgubiš keystore

Nažalost, **ne postoji oporavak** za direktnu APK distribuciju.

Postupak migracije:
1. Generiraj novi keystore (`keytool -genkey ...`)
2. Updateaj 4 GitHub Secreta novim vrijednostima
3. Pokreni novi build
4. Pošalji svim korisnicima broadcast notifikaciju s uputama:
   - Backup podataka iz aplikacije (Postavke → Izvoz)
   - Deinstaliraj staru verziju
   - Instaliraj novi APK
   - Vrati podatke iz backupa
5. Korisnici koji nemaju cloud sync → **gube lokalne podatke**

---

## Procedura kad mijenjaš računalo

1. Kopiraj `vmbalance-release.jks` s starog računala na novo (kroz USB ili kriptirani transfer, ne kroz neenkriptirani cloud)
2. Verificiraj SHA-1 fingerprint na novom računalu — mora biti identičan
3. Ne brisati staru kopiju dok ne potvrdiš da workflow uspješno gradi novi APK koji se instalira preko postojećeg

---

## Play Store kasnije (informativno)

Kad budeš stavljao app na Google Play Store, koristit ćeš **Play App Signing**:

- **Tvoj `vmbalance-release.jks` postaje upload key** — potpisuje APK/AAB koji šalješ Googleu
- Google automatski preznači sa svojim master keyem prije distribucije korisnicima
- **Ako izgubiš upload key** — Google Play Console ga može resetirati (kontakt support, pošalješ novi cert)
- **Ako Google izgubi master key** — to nije tvoj problem, Google to garantira

To znači da je **ovaj keystore koji koristiš sad kompatibilan s Play Store-om** — ne moraš ga mijenjati pri migraciji. Samo ćeš ga registrirati kao upload key u Play Console.

⚠️ **Bitno:** Prije prvog uploada na Play Store, korisnici koji imaju direct-download verziju **ne mogu** automatski preći na Play Store verziju (Play App Signing koristi drugi master cert). Morat ćeš ih obavijestiti da deinstaliraju i ponovno instaliraju s Play Store-a.

---

**Updated:** 13.05.2026  
**Owner:** Milan (vlajn)
