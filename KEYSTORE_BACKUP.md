# 🔐 KEYSTORE BACKUP — KRITIČNO

## Što je keystore i zašto je važan

Android APK datoteke su **digitalno potpisane** keystore-om. Ako se potpis između dvije verzije razlikuje, **Android odbija instalirati update** i korisnik mora deinstalirati app (i izgubiti SVE podatke).

**Bez ovog keystore-a, ne možeš ažurirati niti jednog postojećeg korisnika.**

---

## Lokacija

```
Windows: C:\Users\vlajn\.android\debug.keystore
Linux:   ~/.android/debug.keystore
macOS:   ~/.android/debug.keystore
```

## Default vrijednosti (Android debug keystore)

```
Alias:     androiddebugkey
Password:  android
Key pass:  android
```

---

## ✅ Backup checklist (NAPRAVI ODMAH)

Datoteku `debug.keystore` (3 KB) kopiraj na **minimalno 2 mjesta**:

- [ ] USB stick (fizički, drži ga odvojeno)
- [ ] Password manager (1Password / Bitwarden — postoji opcija za file attachment)
- [ ] Cloud storage privatan folder (Google Drive / OneDrive)
- [ ] Vanjski disk

Uz svaku kopiju zapiši i password (`android`).

---

## Verifikacija backup-a (SHA-1 fingerprint)

Provjeri da je backup ispravan tako da izvučeš SHA-1 fingerprint:

```bash
keytool -list -v -keystore debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Trebao bi vidjeti red oblika:
```
SHA1: AB:CD:EF:12:34:...
```

Ovo zapiši uz backup — ako se ikad nađeš s više keystore-ova, možeš ih razlikovati.

---

## 🚨 Ako izgubiš keystore

Nažalost, **ne postoji oporavak**. Postupak migracije:

1. Generiraj novi keystore (`keytool -genkey ...`)
2. Build novog APK-a s novim keystore-om
3. Pošalji svim korisnicima broadcast notifikaciju s uputama:
   - Backup podataka iz aplikacije (Postavke → Izvoz)
   - Deinstaliraj staru verziju
   - Instaliraj novi APK
   - Vrati podatke iz backup-a
4. Korisnici koji nemaju cloud sync → **gube lokalne podatke** (PIN, lokalne račune, slike koje nisu uploadane)

---

## Pre-release keystore (za Play Store)

Ako u budućnosti pustiš app na Google Play Store, **MORAŠ** generirati pravi release keystore (`upload-key.jks`) — debug keystore se NE prihvaća za Play Store. Tada vrijedi ista procedura backup-a, ali još važnije: izgubiš li `upload-key.jks` koji je registriran na Play Console, ne možeš više pushati update-e na Play Store (rješenje: kontakt s Google supportom).

---

## Procedura kad mijenjaš računalo

1. Kopiraj `debug.keystore` s starog računala u `~/.android/` na novom (kreiraj folder ako ne postoji)
2. Verificiraj fingerprint (vidi gore) — mora biti identičan
3. Ne brisati staru kopiju dok ne potvrdiš da novi build radi update preko postojećeg APK-a

---

**Updated:** 10.05.2026  
**Owner:** Milan (vlajn)
