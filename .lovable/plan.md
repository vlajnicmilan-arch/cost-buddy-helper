## Faza 1 — Privremeni 1-klik banner za recovery

Banner se prikazuje **samo na uređaju koji ima `receipt_cache_*` u localStorage s nepovraćenim itemima**. Nije globalna značajka, čisto recovery mehanizam koji se sam ugasi.

### Komponenta

`src/components/ReceiptRecoveryBanner.tsx` — montira se u `Index.tsx` (dashboard) iznad postojećeg sadržaja.

**Logika prikaza:**
1. Na mount poziva `listLocalCachedReceipts()` iz `src/lib/receiptRecovery.ts`.
2. Filtrira na `status === 'safe_to_restore'`.
3. Ako count > 0 → renderira banner. Inače → vrati `null` (ništa).
4. Klik banner → `navigate('/recovery/receipt-items')`.
5. **Nema dismiss gumba** — banner nestane sam čim user vrati zadnji item (cache se obriše u recovery flowu).

**Tekst (i18n):**
- `recovery.banner.title`: "Pronađeno {{count}} skeniranih artikala koji nisu spremljeni"
- `recovery.banner.cta`: "Vrati ih"

**Stil:** koristi postojeći amber/warning token, ne kreira novi. Touch target ≥44px. Mobile-first.

### Sigurnosna mreža

Ako `listLocalCachedReceipts()` baci grešku (npr. korumpirani cache) → banner se ne prikazuje, greška se proguta. Ne želimo da recovery banner sruši dashboard.

### Životni ciklus

- **Sada:** user instalira novu verziju, banner se prikaže (ima cache), klikne → vrati artikle → banner zauvijek nestane.
- **Faza 3:** kad RCA potvrdi da je write-path stabilan i nema novih sirotih cacheova, **brišemo cijelu komponentu + rutu `/recovery/receipt-items` + helper `receiptRecovery.ts`**. Banner je explicitno privremen.

### Native bump

Komponenta je čisti JS/React — bez Capacitor API-ja, bez nativne promjene. **Bez version bumpa** (`public/version.json` i `build.gradle` ostaju). User dobije banner kroz redovni OTA update appa.

## Faza 2 — RCA (čeka)

Već potvrđeno: 422/422 AI skeniranih u 21.03.–28.05.2026 nemaju iteme. Trebam tvoj email da prebrojim koliko od toga otpada na tebe. Reci ga kad budeš spreman, ili preskačemo i idemo direktno na Fazu 3.

## Faza 3 — Prevencija + čišćenje

Po planu (test + tipovi + warning log) **plus** uklanjanje recovery infrastrukture (banner, ruta, helper) kad se utvrdi da je čisto.

## Što ovo NE radi

- Ne dodaje gumb u postavkama.
- Ne dira write-path.
- Nema banner za dismiss (sam nestane).
- Bez native bumpa.
- Ne kreira nove design tokene.
