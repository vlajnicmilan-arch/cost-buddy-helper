# Adversarial autorizacijski test paket

Cilj: dokazati da **backend** (RLS + edge funkcije + RPC-ovi) odbija nedopuštene
zahtjeve neovisno o frontendu. Sakriveni gumb nije sigurnost.

## Pokretanje

```bash
E2E_SUPABASE_URL=... \
E2E_SUPABASE_ANON_KEY=... \
E2E_SUPABASE_SERVICE_ROLE_KEY=... \
E2E_USER_PASSWORD=... \
npm run test:security
```

## Sintetički korisnici

- `security+a@vmbalance.com` — user A (žrtva / vlasnik podataka)
- `security+b@vmbalance.com` — user B (napadač)

Idempotentno kreirani u `global-setup.ts`, potpuno očišćeni u `global-teardown.ts`.
Žive korisničke redove **NE dira**. Prije/poslije snapshot broja redova u
`counts.ts` osigurava paritetnost.

## Scenariji

| Spec | Scenarij |
| --- | --- |
| 01-cross-user-reads | Nepripadni korisnik → tuđi projekt/expenses/sources |
| 02-role-writes | Worker/member/investor pokušava financijske writeove |
| 03-investor-scope | Što investitor po dizajnu smije vs. što stvarno može |
| 04-rpc-spoofing | Podmetnuti IDs u RPC-ove |
| 05-removed-member | Bivši član nakon delete membershipa |
| 06-ai-and-exports | financial-assistant + izvozi — scope pozivatelja |
| 07-krug-membership | Obicni vs punopravni — write privilegije |

## Politika nalaza

Ako test padne → to je moguća rupa. Ne "popravljati" gaseći assertion; javiti
Milanu za odluku (kao zaseban nalog).
