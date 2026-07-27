# Nalaz: Privacy i Terms stranice — status za Enable Banking

## URL-ovi za prijavu

| Polje | URL |
|---|---|
| Privacy URL | `https://vmbalance.com/privacy-policy` |
| Terms URL | `https://vmbalance.com/terms-of-service` |

Obje rute postoje u `src/App.tsx` (SPA, React Router, lazy-loaded), s produkcijskom domenom `vmbalance.com` (iz `capacitor.config.ts` i canonical taga u `public/terms-of-service/index.html`).

## Sadržaj

- **PrivacyPolicy.tsx** (875 linija, HR/EN/DE, v2.1) — stvaran sadržaj. Sekcija 2.2 "Financijski i poslovni podaci" spominje *analizu bankovnih izvoda*, AI OCR, kategorizaciju. Član 22 GDPR pokriven.
- **TermsOfService.tsx** (127 linija, i18n HR/EN/DE) — stvaran sadržaj: Tactura j.d.o.o., cjenik modula, Paddle MoR, 14-dnevni povrat, GDPR prava, ograničenje odgovornosti.
- **RefundPolicy.tsx** i **Impressum.tsx** također postoje kao pune stranice.

## ⚠️ Rizik za Enable Banking compliance review

Trenutne stranice **postoje i nisu prazne**, ali **NE spominju eksplicitno**:

1. **"Open Banking" / "PSD2" / "AISP"** u pravnom dokumentu (spomen postoji samo u UI stringovima `i18n/locales/*.json` na ekranu za povezivanje banke).
2. **Enable Banking Oy** (Finska) kao imenovani **sub-processor / data processor**.
3. **Pravnu osnovu** za dohvat bankovnih transakcija (izričita privola korisnika, čl. 6(1)(a) GDPR + PSD2 SCA).
4. **Tijek podataka** Banka → Enable Banking → Centar i **retenciju** dohvaćenih bankovnih transakcija.
5. **Prava korisnika specifično za bank-sync**: povlačenje privole = raskid AIS konekcije, brisanje dohvaćenih transakcija.

Enable Banking u produkcijskoj AISP registraciji tipično zahtijeva da Privacy Policy imenuje njih kao sub-processora i opiše PSD2 flow. Postoji realna šansa da će review tražiti dopunu prije odobrenja.

## Preporuka (za Milanovu odluku, ne gradim ništa)

Predati URL-ove sada kakvi jesu i pričekati feedback Enable Banking reviewa. Ako traže dopunu, dodati novu sekciju u Privacy Policy (npr. "3.x Open Banking / PSD2") s gornjih 5 točaka na sva tri jezika + spomen u ToS-u. Manji, izoliran posao (bez dodira balance/settlement/RLS/migracija).

## Van opsega ovog nalaza

Nula izmjena. Nula migracija, RPC-ova, edge fn ni frontend koda. Ako Milan odobri dopunu, tražim posebno odobrenje s konkretnim tekstom prije pisanja.
