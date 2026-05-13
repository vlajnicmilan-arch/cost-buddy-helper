# Cilj
Osigurati da APK na vmbalance.com bude potpisan pravim release keystoreom (ne debug-om), te imati siguran backup keystore-a kompatibilan s budućom Play Store migracijom.

# Trenutno stanje (verificirano u kodu)
- `android/app/build.gradle` — `signingConfigs.release` već postoji i čita 4 env varijable
- `.github/workflows/android-build.yml` — već dekodira `ANDROID_KEYSTORE_BASE64` i potpisuje `assembleRelease`
- `KEYSTORE_BACKUP.md` — **zastario**, opisuje debug keystore (lozinka `android`)
- **Nepoznato:** jesu li 4 GitHub Secrets stvarno postavljeni u repou

# Plan u 4 koraka

## Korak 1 — Provjeri postoje li GitHub Secrets (ti, 1 min)
Idi na GitHub repo → Settings → Secrets and variables → Actions.

Traži ova 4 imena:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

**Ako sva 4 postoje** → preskoči Korak 2, idi na Korak 3.
**Ako ne postoje (ili nedostaje neki)** → Korak 2.

## Korak 2 — Generiraj release keystore (ti, lokalno, 5 min)
Na svom računalu:

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
[Convert]::ToBase64String([IO.File]::ReadAllBytes("vmbalance-release.jks")) > vmbalance-release.jks.b64
```

U GitHub repou → Settings → Secrets → New repository secret, dodaj:
- `ANDROID_KEYSTORE_BASE64` = sadržaj `.b64` filea
- `ANDROID_KEYSTORE_PASSWORD` = lozinka iz keytool
- `ANDROID_KEY_ALIAS` = `vmbalance`
- `ANDROID_KEY_PASSWORD` = lozinka iz keytool (ista)

**Backup `vmbalance-release.jks` na minimalno 2 mjesta** (USB, password manager file attachment, cloud privatan folder). Bez tog filea ne možeš nikad više pushati update postojećim korisnicima.

## Korak 3 — Verifikacija (ti, 2 min)
Triggeraj workflow ručno: GitHub repo → Actions → "Android Release APK" → Run workflow.

Kad završi:
1. Skini APK iz Artifacts (`vmbalance-release-apk`)
2. Provjeri potpis lokalno:
   ```bash
   keytool -printcert -jarfile vmbalance-X.Y.Z.apk
   ```
3. SHA1 fingerprint mora odgovarati onome iz tvog keystorea (`keytool -list -v -keystore vmbalance-release.jks`).

Ako fingerprint odgovara — APK je release-signed. Ako ne odgovara ili se ne razlikuje od debug — secrets su krivo postavljeni.

## Korak 4 — Ažurirati `KEYSTORE_BACKUP.md` (ja, 1 prompt)
Prepišem cijeli file da odražava stvarnost:
- Briše debug keystore reference (lozinka `android`)
- Dokumentira release keystore (`vmbalance-release.jks`, alias `vmbalance`)
- Backup procedura za .jks file + base64
- Gdje su secrets pohranjeni (GitHub repo Settings)
- Verifikacijski `keytool` recept
- Play Store migracijska napomena

# Play Store kasnije (informativno)
Kad budeš spreman za Play Store, koristit ćeš **Play App Signing**:
- Tvoj postojeći `vmbalance-release.jks` postaje **upload key** (potpisuje APK koji šalješ Googleu)
- Google automatski preznači sa svojim master keyem prije distribucije
- Ako izgubiš upload key, Google ga može resetirati (za razliku od starog modela gdje je gubitak keya značio kraj)

To znači da **ovaj keystore koji sad generiramo je kompatibilan s budućim Play Store-om** — ne moraš ga mijenjati.

# Što ja radim u build modu
- **Korak 4 isključivo** (prepisivanje `KEYSTORE_BACKUP.md`)

# Što ti radiš
- **Koraci 1, 2, 3** (sve što uključuje keystore generiranje, GitHub Secrets, lokalnu verifikaciju)

Razlog: keystore i lozinke ne smiju proći kroz Lovable ili AI sandbox. Generiranje, base64, secrets — sve to ide direktno s tvog računala u GitHub.
