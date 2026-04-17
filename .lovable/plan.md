

Korisnik želi Opciju 1: promijeniti `server.url` u `capacitor.config.ts` tako da APK odmah ide na pravu stranicu umjesto na Landing.

Trenutno: `server.url: 'https://vmbalance.com?forceHideBadge=true'` → otvara Landing page.

Trebam vidjeti kako se odlučuje između Landinga i app-a. Pretpostavljam da `/` vodi na Landing u browseru, a APK treba ići direktno na `/app` ili `/storage-setup`.

Iz konteksta:
- `publicRoutes.ts` lista `/app` kao "transient redirect target"
- Postoji `/storage-setup` ruta
- Mem `pwa-routing-and-sync-logic` kaže: "/ redirects to /app, auto restoration"

Najsigurnija opcija je `/app` jer već postoji redirect logika koja odlučuje gdje korisnika poslati (storage setup, auth, ili home) na temelju stanja.

## Plan

**1. Izmjena `capacitor.config.ts`**

Promijeniti `server.url` s:
```
https://vmbalance.com?forceHideBadge=true
```
na:
```
https://vmbalance.com/app?forceHideBadge=true
```

Time APK preskače Landing page i odmah ulazi u app routing logiku (`/app` → automatski preusmjerava na storage-setup, auth, ili home — ovisno o stanju korisnika).

**2. Što ovo NE mijenja**
- Live Sync nastavlja raditi normalno
- Sve buduće Lovable promjene se i dalje vide odmah na mobitelu nakon Publish
- Web verzija (Chrome) i dalje radi kao prije

**3. Što korisnik mora napraviti nakon izmjene**
- Napraviti **jedan zadnji** APK build (`npx cap sync android` + build u Android Studiju)
- Instalirati novi APK na telefon
- Nakon toga: sve buduće promjene idu automatski preko Live Synca, **bez novih APK buildova**

**4. Verifikacija**
Nakon instalacije novog APK-a:
- APK se otvara → odmah ide u app (ne na Landing)
- Klikovi rade na storage-setup ekranu
- U `app_diagnostics_logs` tablici počnu se pojavljivati Android događaji (boot_start, storage_init_start)

Ako i dalje ne radi nakon ove izmjene, prebacit ćemo se na Opciju 2 (lokalni bundle).

