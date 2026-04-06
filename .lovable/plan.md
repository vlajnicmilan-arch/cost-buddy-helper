
Problem koji sada vidim:
- Screenshot pokazuje da unos dolazi do koraka “Potvrdite PIN” i da se nakon 4 znamenke aktivira spremanje.
- Dakle, prethodni problem s korakom potvrde je vrlo vjerojatno riješen.
- Trenutni kvar je u samom spremanju PIN-a na uređaj.

Do I know what the issue is?
- Da.
- `SetPinDialog` prikazuje toast “Greška pri spremanju PIN-a” samo ako `await setPin(newPin)` baci grešku.
- `setPin()` u `AppLockContext` samo zove `SecureStorage.set(...)`.
- A `SecureStorage` trenutno na native platformi koristi `@capacitor/preferences`, iako projekt već ima instaliran `capacitor-secure-storage-plugin`.
- Zato je najvjerojatniji stvarni uzrok: PIN se i dalje sprema kroz pogrešan native storage sloj, pa zapis pada na Androidu.

Datoteke koje treba doraditi:
1. `src/lib/secureStorage.ts`
2. `src/contexts/AppLockContext.tsx`
3. `src/components/SetPinDialog.tsx`

Plan implementacije:
1. Zamijeniti native backend za PIN spremanje
   - U `secureStorage.ts` koristiti `SecureStoragePlugin` na native platformi.
   - Na webu zadržati fallback na `localStorage`.
   - `get()` neka vrati `null` ako ključ ne postoji, umjesto da ruši flow.
   - Ukloniti zastarjeli komentar da secure storage plugin “nije bio dostupan”.

2. Ojačati `AppLockContext`
   - Oko inicijalnog čitanja PIN postavki dodati `try/catch`, da lock sustav ne ostane u polu-ispravnom stanju ako native storage baci grešku.
   - U `setPin()` zadržati throw ako spremanje stvarno ne uspije.
   - Po mogućnosti odmah nakon spremanja napraviti read-back provjeru da je hash stvarno zapisan.

3. Ispraviti poruku greške u dijalogu
   - U `SetPinDialog` zadržati postojeći ref-based flow za `step` i `firstPin`.
   - Suziti `try/catch` tako da “Greška pri spremanju PIN-a” pokriva samo stvarni storage save.
   - Haptics / avatar / success toast odvojiti od storage greške, da se ne prijavi lažna greška spremanja.

4. Provjera nakon izmjene
   - Testirati postavljanje 4-znamenkastog i 6-znamenkastog PIN-a.
   - Zatvoriti i ponovno otvoriti Settings i provjeriti da se umjesto “Postavi PIN” prikaže switch.
   - Zaključati aplikaciju i provjeriti ispravan/pogrešan PIN.
   - Ako je APK napravljen prije nego što je secure storage plugin bio uključen u native build, napraviti jedan novi `npx cap sync android` + rebuild.

Tehnički sažetak:
```text
Sada:
SetPinDialog -> AppLockContext.setPin() -> SecureStorage.set() -> @capacitor/preferences

Nakon popravka:
SetPinDialog -> AppLockContext.setPin() -> SecureStorage.set() -> capacitor-secure-storage-plugin
                                                   \-> localStorage samo na webu
```

Očekivani rezultat:
- PIN će se stvarno spremiti na uređaj.
- U Settings će se odmah pojaviti PIN lock switch.
- Toast “Greška pri spremanju PIN-a” pojavit će se samo ako spremanje stvarno padne.
