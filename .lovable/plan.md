

# Plan: Terms of Service stranica (/terms-of-service)

## Što se radi

Kreiranje potpuno lokalizirane (HR/EN/DE) stranice s uvjetima korištenja koja pokriva pretplate, otkazivanje, odgovornost i GDPR prava korisnika.

## Sadržaj stranice (sekcije)

1. **Uvod** — tko pruža uslugu, što je V&M Balance
2. **Korištenje usluge** — registracija, obveze korisnika, zabranjena upotreba
3. **Pretplate i plaćanje** — Free/Pro/Business razine, probni period, Stripe naplata
4. **Otkazivanje i povrat** — kako otkazati, što se dešava s podacima, pravo na povrat (14 dana EU)
5. **Ograničenje odgovornosti** — "as is", bez financijskih savjeta
6. **GDPR prava** — pristup, ispravak, brisanje, prenosivost, prigovor
7. **Izmjene uvjeta** — obavijest korisnicima
8. **Kontakt** — email za pitanja

## Datoteke

| Datoteka | Akcija |
|---|---|
| `src/pages/TermsOfService.tsx` | **Nova** — stranica s i18n ključevima, isti layout kao PrivacyPolicy |
| `src/App.tsx` | Dodati lazy import i rutu `/terms-of-service` |
| `src/i18n/locales/hr.json` | Dodati `tos.*` ključeve (hrvatski tekst) |
| `src/i18n/locales/en.json` | Dodati `tos.*` ključeve (engleski tekst) |
| `src/i18n/locales/de.json` | Dodati `tos.*` ključeve (njemački tekst) |

## Ključne odluke
- Koristiti `t()` za sav tekst (za razliku od PrivacyPolicy koja je hardkodirana)
- Isti vizualni stil kao PrivacyPolicy (back button, prose sekcije)
- Dodati rutu u sve routing faze (javno dostupna stranica, ne zahtijeva auth)
- Nema promjena baze ni backend-a

