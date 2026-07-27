# Dijagnoza (read-only)

## 1. "Sandbox" poruka — (a) STATIČNA, kozmetika

`src/components/OpenBankingPanel.tsx:264-267` bezuvjetno renderira amber banner s tekstom `t('openBanking.sandboxNotice')`. Nema flaga, nema detekcije okruženja — natpis se prikazuje uvijek, čak i kad backend koristi produkcijske tajne. Zastarjelo od prethodne faze (kad smo bili u sandboxu).

**Izvori:**
- `src/i18n/locales/hr.json:5115` — "Trenutno koristimo sandbox okruženje…"
- `src/i18n/locales/en.json:5106` — isto
- (de.json vjerojatno analogno)

**Zaključak:** poruka NE utječe na funkcionalnost. To je samo natpis koji treba maknuti/prepraviti.

## 2. Milanovi zapisi u bazi

```
bank_connections (Milan):
  1 red, status='pending', bank='Erste & Steiermärkische Bank',
  created_at=2026-07-27 18:53:50 UTC

bank_accounts (Milan):
  0 redova
```

**Interpretacija:**
- Milan JE pokrenuo flow kroz Centar (`bank-connect-start` je upisao pending red).
- Ali `bank-connect-complete` nikad nije završio uspješno — status nije prešao u `active`, session_id nije upisan, računi nisu insertani.
- Znači: ili callback iz Enable Banking nije stigao natrag na `/functions/v1/bank-connect-complete`, ili je stigao i pao (npr. state token mismatch, EB session exchange fail), ili je Milan povezivanje dovršio DIREKTNO u EB dashboardu ("Activate by linking accounts" u EB panelu) što NE trigira Centar callback.

Nema logova od `bank-connect-complete` u prethodnom edge-function log dumpu (nije bootan) — to potvrđuje da callback vjerojatno nikad nije ni pogođen s Milanovog spajanja, ili nije bio unutar log prozora.

## 3. Koji APP_ID edge fn koristi

Ne mogu čitati vrijednost tajne u vaultu (secret values nisu izloženi). Indirektna provjera nije napravljena (nisam htio dispatchati poziv bez odobrenja). Dvije opcije za verifikaciju kasnije:
- Trigger `bank-list-aspsps?country=HR` i gledati vraća li stvarne HR ASPSP-ove (produkcija) ili prazno/error (sandbox nema HR).
- Dodati jednokratni `console.log(APP_ID.slice(0,8))` u shared helper (ne sad, treba odobrenje).

**Indicij da su prod tajne aktivne:** Milan tvrdi da je uspješno linkao PRAVE Erste račune kroz EB produkcijski dashboard koristeći isti APP_ID (`ef3e7b6f…`). To znači tajne u vaultu su ispravne (jer Milan ih je zamijenio). Da su edge fn još držale stari APP_ID, EB /auth poziv bi vratio grešku ili sandbox flow. Umjesto toga imamo pending red = EB /auth je prošao = APP_ID stvarno je produkcijski.

## Glavna hipoteza zašto računi ne dolaze u Wallet

Milan je klikom u **Enable Banking dashboardu** ("Activate by linking accounts") linkao račune na EB strani, ali to je *EB-side aktivacija licence/pristupa*, ne PSD2 consent flow za konkretnog krajnjeg korisnika kroz Centar. PSD2 consent + session koji Centar treba mora ići:

```
Wallet UI → bank-connect-start → EB /auth (redirect na banku)
→ user login/consent na Ersteu → banka redirecta na
bank-connect-complete → EB /sessions (razmjena code→session_id)
→ bank_connections.status='active' + bank_accounts INSERT
```

Ako Milan nije dovršio bankovni login+consent na Ersteovim stranicama tako da završi na `.../functions/v1/bank-connect-complete?code=…&state=…`, session nikad nije razmijenjen i računi ne postoje u Centar bazi. Stanje `pending` bez pripadajućih računa je točno taj scenarij.

Pomoćni uzroci koje treba isključiti:
- **CORS / redirect URL mismatch:** `REDIRECT_URI` u `bank-connect-start` je `${SUPABASE_URL}/functions/v1/bank-connect-complete`. Ako u EB dashboardu (produkcijska app) taj URL nije whitelistan kao dopušteni redirect, banka nikad ne redirecta natrag.
- **`verify_jwt = false` za complete:** treba potvrditi u `supabase/config.toml` — ako je true, poziv iz EB (bez JWT-a) bi bio odbijen s 401 i pending bi zauvijek ostao pending.

## Preporuka Milanu (samo za razmatranje, ne gradim)

Prije bilo kakvog popravka, korisno je:
1. U EB produkcijskoj aplikaciji provjeriti da je registriran redirect URL `https://fzalxjretvtvokiotvkf.supabase.co/functions/v1/bank-connect-complete`.
2. Potvrditi `verify_jwt = false` za `bank-connect-complete` u `supabase/config.toml`.
3. Milan iznova pokreće flow **iz Centar Walleta** (ne iz EB dashboarda), prati redirect na Erste, završi login/SCA, i gleda vraća li ga na Centar stranicu s porukom "Banka je spojena". Ako da — bank_accounts se puni. Ako ne — logovi `bank-connect-complete` pokazat će zašto.
4. Sandbox banner (točka 1) makne se ili zamijeni statusnim natpisom "Produkcija — HR banke aktivne" u zasebnoj mikroizmjeni.

Ništa nije mijenjano.
