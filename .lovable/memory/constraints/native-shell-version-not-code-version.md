---
name: Native shell version ≠ code version
description: Capacitor APK ljuska vrti live web bundle s vmbalance.com; versionName/currentVersion iz update_check_performed odražava OMOT, ne verziju React koda. Nikad ne izvoditi zaključke o "koju verziju korisnik koristi" iz tog polja.
type: constraint
---

Uređaji uvijek učitavaju najnoviji web bundle s vmbalance.com (boot_start href to potvrđuje). `currentVersion` u `update_check_performed` telemetriji je versionName Android ljuske (npr. 2.0.8), NE verzija JS koda koji korisnik trenutno vrti. Svi app-level eventi (`app_version`) prijavljuju stvarnu verziju koda (npr. 2.2.0).

**Pravilo:** Prilikom root-cause analize baga NE tvrditi "korisnik je na staroj verziji jer currentVersion=X". Uvijek gledati `app_version` iz telemetrije ili pretpostaviti da je korisnik na najnovijem deployanom kodu. Ovo je verificirano jučer (Petar/8.7.) — netočna interpretacija skoro odvela dijagnozu incidenta s balansom u pogrešnom smjeru.
