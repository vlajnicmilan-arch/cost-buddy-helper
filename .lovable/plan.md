

# Plan: Popravak provjere ažuriranja za nativnu aplikaciju

## Problem

`PWAUpdatePrompt` komponenta vraća `null` za nativne aplikacije (linija 314: `if (isNativeApp) return null`). To znači da se `PWAUpdatePromptInner` nikad ne renderira, `checkForUpdatesRef` ostaje `null`, i kada klikneš "Provjeri ažuriranja" u Postavkama — ili se ništa ne dogodi, ili Service Worker registracija padne u WebView kontekstu i prikaže grešku.

## Rješenje

Napraviti zasebnu logiku provjere ažuriranja za nativnu aplikaciju koja ne ovisi o Service Workeru:

### Izmjene u `PWAUpdatePrompt.tsx`

1. Dodati novu funkciju `nativeCheckForUpdates` koja:
   - Dohvaća `/version.json` s produkcijskog URL-a (no-cache)
   - Uspoređuje s `APP_VERSION`
   - Ako je nova verzija dostupna → prikazuje toast s opcijom reload (`window.location.reload()`)
   - Ako je aplikacija ažurna → prikazuje "Aplikacija je ažurna!" toast

2. Postaviti `checkForUpdatesRef` na tu funkciju odmah pri importu (izvan komponente), tako da Settings može pozvati `checkForUpdates()` bez da PWAUpdatePromptInner bude renderiran.

3. `PWAUpdatePrompt` komponenta i dalje vraća `null` za native — nema potrebe za Service Worker UI-jem.

### Kod (konceptualno)

```typescript
// Na vrhu datoteke, odmah postavi ref za native
if (isNativeApp) {
  checkForUpdatesRef = async () => {
    const latestVersion = await fetchLatestVersion();
    if (latestVersion && isRemoteVersionNewer(APP_VERSION, latestVersion)) {
      toast.info('Nova verzija dostupna!', {
        action: { label: 'Ažuriraj', onClick: () => window.location.reload() },
        duration: 10000,
      });
    } else {
      toast.success('Aplikacija je ažurna!');
    }
  };
}
```

### Što se mijenja
- **`PWAUpdatePrompt.tsx`**: Dodaje se native update check logika (~15 linija)
- Ništa drugo se ne mijenja

### Rezultat
Gumb "Provjeri ažuriranja" u Postavkama će na nativnoj aplikaciji ispravno provjeriti verziju i ponuditi reload ako postoji novija verzija, bez ikakve ovisnosti o Service Workeru.

