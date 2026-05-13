## Problem

Iz logova `bank-list-aspsps`:
```
TypeError: "pkcs8" must be PKCS#8 formatted string
  at importPKCS8 ... at getKey (enableBankingJwt.ts:16)
```

Ključ je PKCS#8 (`-----BEGIN PRIVATE KEY-----`), ali kad je spremljen u Lovable Cloud secrets, newlineovi su izgubljeni. Trenutni `getKey()` pokušava ih rekonstruirati, ali ima bug:

```ts
pem = pem
  .replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n")
  .replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----")
  .replace(/(.{64})/g, "$1\n");   // ← BUG
```

Posljednji `replace` ide preko CIJELOG stringa od pozicije 0, uključujući BEGIN header (32 znaka). Razbije base64 sadržaj na krivim offsetima i `importPKCS8` više ne prepoznaje strukturu.

## Rješenje

Robusna normalizacija ključa u `supabase/functions/_shared/enableBankingJwt.ts`:

1. Izvući base64 sadržaj iz ulaza (regex između `BEGIN PRIVATE KEY` i `END PRIVATE KEY`, uz fallback ako nema headera).
2. Ukloniti SVE whitespace iz base64 dijela.
3. Rekonstruirati PEM s pravilno chunk-anim base64 (64 znaka po liniji), ispravnim BEGIN/END markerima i trailing newline.
4. Dodati jasnu error poruku ako base64 nije validan (sa duljinom, ne sa sadržajem).

Pseudokod:
```
const raw = PRIVATE_KEY_PEM.trim();
const m = raw.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
const b64 = (m ? m[1] : raw).replace(/\s+/g, "");
const chunks = b64.match(/.{1,64}/g)!.join("\n");
const pem = `-----BEGIN PRIVATE KEY-----\n${chunks}\n-----END PRIVATE KEY-----\n`;
cachedKey = await importPKCS8(pem, "RS256");
```

## Što se NE dira

- Secrets ostaju isti — ne treba ponovno upload.
- Nijedna druga edge funkcija, frontend, ni DB.
- Logika JWT signing-a, audience, issuer — sve ostaje.

## Testiranje

Nakon deploya pozvati `bank-list-aspsps` (FI sandbox) preko `OpenBankingPanel` i provjeriti edge logove — očekujem listu banaka umjesto `pkcs8 must be PKCS#8 formatted string`.

## Promijenjeni fajlovi

- `supabase/functions/_shared/enableBankingJwt.ts` (samo `getKey()` funkcija)
