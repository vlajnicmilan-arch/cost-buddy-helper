# Povlačenje prethodnog nalaza — produkcija NIJE stara od 2.8.

## Doslovni URL-ovi koje sam dohvatio

- `https://vmbalance.com/` i `https://vmbalance.com/app` — **oba vraćaju isti dokument**
  (SPA fallback), oba referenciraju `index-DM1jJWs-.js`, `index-vSHNfVh9.css`,
  `react-vendor-DFQnB1PE.js`, `jspdf-Br8rfnai.js`. `x-deployment-id: 1a7dd7c0…`,
  `cache-control: no-cache`.
- Prethodno sam gledao **isto mjesto** (nije bila zamjena landinga za app), ali sam
  zaključak izveo iz **jednog i18n ključa u ulaznom chunku**, a nisam pretražio lijene
  chunkove. To je bila greška.

## Što sam sada napravio

Rekurzivno skinuo **153 JS chunka (6,48 MB)** s produkcije, krenuvši od `index-DM1jJWs-.js`
i prateći sve `assets/*.js` reference, pa pretražio sadržaj.

## Rezultat pretrage (produkcijski paket)

| Niz | Nađeno | Gdje |
|---|---|---|
| `eRačun` | DA | `index-DQXSR0oa.js`, `Index-DKrjBiAj.js` |
| `Ulazni računi` | DA | isto |
| `Poveži uplate` | DA | isto |
| `Duguju mi` | DA | isto |
| `incoming_invoices` | DA | `Index-DKrjBiAj.js` |
| `eracun_payment_links` | DA | `Index-DKrjBiAj.js` |
| `Poravnaj s bankom` | DA | `index-DQXSR0oa.js` |
| `balance_after`, `bank_row_seq` | DA | `App-*`, `ImportReview-*`, `OpenBankingPanel-*` |
| `undo_import_batch`, `import_transfer_rules`, `activate_module_trial` | DA | `App-DIgpWkqo.js` |
| `historyExtended` / „Povijest je dopunjena” | NE | nigdje |

**Korisnikov iskaz stoji.** Svi ekrani koje je koristio jesu u živom paketu.
Prethodni nalaz („živi bundle stariji od 2.8.”) **povlačim — bio je kriv.**

## Gdje je rez zapravo

Prijevodi su statički bundlani (`src/i18n/index.ts` importa `hr/en/de.json`), pa
izostanak ključa jest signal — ali samo za taj jedan commit, ne za tri dana.

- `eracun_payment_links` → commit `b24c09ca`, 2.8. **22:15** — **JE u produkciji**
- `paymentFetchWindow` → `f6689bda`, 2.8. **22:35** — **JE u produkciji**
- `historyExtended` / `historyGate` → `082d9723`, 2.8. **23:07** — **NIJE u produkciji**

Živi build je dakle s **2.8. između 22:35 i 23:07**. Nedostaje **31 commit**:
2 s 2.8. (kasno navečer), 5 s 4.8., 24 s 5.8.

Praktično nedostaje: historyGate (preskakanje usklađivanja za povijesne izvode),
sve od 4.8. i sve današnje (uklanjanje `billing_enabled`, `entitlements_mode`,
suženje biznis modula, XSS popravak `bank-connect-complete`, `ai_route_costs`).
Baza i edge funkcije **jesu ažurne** — to se deploya odmah; zaostaje samo web bundle.

## Ispravak metode provjere

1. Ne oslanjati se na jedan i18n ključ u ulaznom chunku.
2. Rekurzivno skinuti sve chunkove i pretražiti sadržaj za više neovisnih markera.
3. Hash usporedbu ne koristiti kao dokaz (build okolina).
4. Znati koji commit je uveo marker (`git log -S`) da se rez datira precizno.

## Preporuka (ne izvršavam bez odobrenja)

Web objava sa 5.8. stvarno nije legla, ali zaostatak je ~2,5 dana koda, ne 3+ dana svega,
i baza je ažurna. Sljedeći korak bi bio ponovna objava pa ista provjera s markerom
„Povijest je dopunjena”. Ne diram ništa dok ne kažeš.
