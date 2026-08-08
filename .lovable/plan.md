# Nalaz: pozivnica u Krug se zapiše, ali obavijest ne nastane

## Što logovi točno pokazuju

`krug-add-member`, 2026-08-08 09:16:12 UTC:

```
[KRUG-ADD-MEMBER] notify error FunctionsHttpError: Edge Function returned a non-2xx status code
  status: 401, statusText: "Unauthorized",
  url: https://<projekt>.supabase.co/functions/v1/notify-krug-event
```

Prije toga u istom pozivu nema `invitation insert error` — pozivnica je uredno upisana (poklapa se s pending retkom u 09:16). Nakon greške funkcija vraća `ok: true, notified: false`, pa UI ne prijavljuje ništa.

`notify-krug-event`, isto vrijeme: samo `booted (time: 31ms)`. Nijedan `console` zapis iz tijela funkcije.

## Interpretacija (s ogradom)

- Funkcija je **bootala** u 09:16:12 — dakle zahtjev je prošao platformski edge (`verify_jwt = false` za `notify-krug-event` u `config.toml`, potvrđeno). 401 dolazi iz **vlastitog internog guarda** funkcije, koji vraća `{"error":"unauthorized"}` bez ijednog log zapisa — što točno objašnjava prazan log.
- Guard prihvaća `Authorization: Bearer <token>` ako je jednak `SUPABASE_SERVICE_ROLE_KEY` **ili** `KRUG_NOTIFY_INTERNAL_KEY`. `krug-add-member` zove preko `admin.functions.invoke(...)`, tj. šalje service role key.
- Komentar u samoj funkciji (linije 105–111) dokumentira da je taj mehanizam **već jednom puknuo**: „SUPABASE_SERVICE_ROLE_KEY drifted from the vault-stored value after a platform key rotation, causing 401". Zbog toga je i uveden dedicirani `KRUG_NOTIFY_INTERNAL_KEY`.
- Potvrda iz produkcije: obavijest `krug_deleted` u 09:04 **je** nastala — a taj put ide iz baze (`krug_emit_notification` → `net.http_post` s vault ključem `krug_notify_internal_key`). Dakle **interni-ključ put radi, service-key put ne radi.**

Ograda: ne mogu pročitati vrijednosti tajni pa ne mogu dokazati da su ključevi različiti; mogu dokazati da guard odbija upravo taj poziv, a da paralelni put s internim ključem prolazi.

## Prijedlog popravka (jedan od dva; preporuka A)

**A. `krug-add-member` prestaje ovisiti o service keyu za poziv obavijesti**
Poziv `notify-krug-event` ide s eksplicitnim `Authorization: Bearer ${KRUG_NOTIFY_INTERNAL_KEY}` (isti ključ koji već koristi baza i koji dokazano prolazi), uz fallback na service key ako varijabla nije postavljena. Jedna izmjena u jednoj datoteci, koristi kanal koji je danas dokazano ispravan.

**B. Ukloniti edge-to-edge poziv**
`krug-add-member` umjesto HTTP poziva zove postojeći DB put (`krug_emit_notification`) preko admin klijenta. Arhitektonski čišće (jedan kanal umjesto dva), ali dira SQL sloj i traži provjeru potpisa funkcije.

## Verifikacija nakon popravka

1. Nova pozivnica iz aplikacije.
2. Log `krug-add-member` mora sadržavati `[KRUG-ADD-MEMBER] notify result { delivered: 1 }` i **ne** `notify error`.
3. `notifications`: 1 redak `krug_invited` za pozvanog, s `data->>'dedup_ref' = krug_invited:<invitation_id>`.
4. Ponovljena pozivnica iste osobe ne smije stvoriti drugi redak (dedup).

## Napomena (nije u opsegu)

Pozvani trenutno vidi poziv tek ulaskom u modul Krug — dok obavijest ne radi, nema aktivnog kanala koji ga dovede.
