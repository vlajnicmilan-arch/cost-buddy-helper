

# Plan: Poboljšanja nativne Android aplikacije

Imaš već @capacitor/camera instaliran ali ne koristiš ga u kodu. Evo plana po prioritetima:

---

## 1. Nativna kamera za skeniranje računa

**Trenutno stanje**: Skeniranje koristi HTML `<input type="file">` — radi, ali nema pristup nativnoj kameri direktno.

**Promjene**:
- Kreirati `src/hooks/useNativeCamera.ts` hook koji detektira Capacitor platformu i koristi `@capacitor/camera` za fotografiranje, a fallback na web `<input>` za PWA/browser
- Integrirati u `useReceiptScanner.ts` — kad je nativna platforma, pozvati `Camera.getPhoto()` umjesto file input-a
- Prednosti: brže pokretanje kamere, bolji autofokus, flash kontrola

## 2. Splash screen i ikona

**Promjene**:
- Instalirati `@capacitor/splash-screen` paket
- Dodati splash screen konfiguraciju u `capacitor.config.ts` (boja pozadine, trajanje)
- Korisnik će trebati: pokrenuti `npx cap sync android` i u Android Studiju koristiti Image Asset tool za ikonu + splash resurse

## 3. Offline podrška za nativnu app

**Trenutno stanje**: Live Sync znači da app ovisi o internetu.

**Promjene**:
- Dodati detekciju mrežne veze (`navigator.onLine` + `@capacitor/network`)
- Kreirati lokalni queue za transakcije — kad nema neta, spremaj u IndexedDB
- Kad se veza vrati, automatski sync s bazom
- Prikazati offline banner u nativnoj verziji

## 4. Push notifikacije

**Promjene**:
- Instalirati `@capacitor/push-notifications`
- Kreirati `src/hooks/useNativePush.ts` za registraciju i primanje notifikacija
- Integrirati s backend-om — spremiti device token u bazu, slati notifikacije za podsjetnike, budget alerte, family poruke
- Potreban Firebase Cloud Messaging (FCM) setup — korisnik mora kreirati Firebase projekt i dodati `google-services.json`

---

## Redoslijed implementacije

| Korak | Što | Složenost |
|-------|-----|-----------|
| 1 | Nativna kamera | Niska — plugin već instaliran |
| 2 | Splash screen + ikona | Niska — config + native resursi |
| 3 | Offline podrška | Srednja — IndexedDB queue + sync |
| 4 | Push notifikacije | Visoka — Firebase setup + backend |

Predlažem da krenemo s **nativnom kamerom** jer je plugin već instaliran i zahtijeva najmanje promjena. Poslije toga splash screen, pa offline, pa push.

