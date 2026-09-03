---
name: Prekidači modula ukinuti
description: Nema uključivanja/isključivanja modula; nav uvijek prikazuje sve, pristup određuje pretplata
type: constraint
---

- `getNavVisibility` uvijek vraća 'visible'; nema skrivanja modula iz BottomNav-a.
- `useModuleStates.enabled` više nije korisnička odluka (business.enabled = pravo na modul).
- Uklonjeni localStorage ključevi: `krug_mode_enabled`, `projects_module_enabled`, `business_feature_enabled`.
- Poslovno pravo se čita kroz `useBusinessFeature()` (entitlement), ne kroz prekidač.
- Settings → sekcija sadrži samo AI asistenta + ulaz "Tvrtke" za korisnike s pravom.
- **Zašto:** prekidači su stvarali krug (modul skriven → korisnik misli da nema pristup) i gubili se čišćenjem preglednika.
