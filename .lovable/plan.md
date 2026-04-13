

# Plan: APK kao primarni install na Android mobitelu

## Trenutno stanje
- `/install` stranica detektira platformu (Android/iOS/Desktop) i preglednik
- Na Androidu prikazuje **PWA upute kao primarno** + APK kao malu sekundarnu karticu ispod
- Na desktopu/iOS-u prikazuje PWA upute (što je ispravno)

## Promjena

### Na Android mobitelu: APK postaje primarni CTA
- Velika kartica s "Preuzmi aplikaciju" gumbom (APK download) kao **prvi i najistaknutiji element**
- PWA upute premjestiti u collapsible "Alternativna instalacija" sekciju ispod
- Dodati napomenu: "Nakon preuzimanja, otvori datoteku i dozvoli instalaciju"

### Na desktopu (bilo kojem): ostaje PWA
- Desktop korisnici i dalje vide PWA upute jer APK nema smisla na računalu

### Na iOS-u: ostaje PWA (Safari upute)
- iOS nema APK, nativna verzija zahtijeva App Store — PWA ostaje jedina opcija

## Datoteka za promjenu
| Datoteka | Akcija |
|---|---|
| `src/pages/Install.tsx` | Reorganizirati Android prikaz: APK kartica gore, PWA u collapsible |

## Logika
```text
if (platform === 'android')
  → Primarno: APK download kartica (velika, istaknuta)
  → Sekundarno: PWA upute u collapsible
else
  → Postojeće ponašanje (PWA primarno)
```

Nema promjena baze, migracija ni backend-a.

