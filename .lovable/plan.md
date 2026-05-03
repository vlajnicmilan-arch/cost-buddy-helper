
## Cilj
Otkloniti tehničke smetnje koje su izronile u prošlom auditu i pripremiti regression checklist prije javnog lansiranja. Fokus: stvarni runtime problemi, ne kozmetika.

## 1. "signal is aborted without reason" — status check

Pregledom koda potvrđeno:
- `src/lib/sentry.ts` već ignorira ovu poruku (ne ide u Sentry).
- `src/lib/diagnosticLogger.ts` (linija 326) je ne logira u dijagnostiku.
- `src/hooks/useReceiptScanner.ts` ju tretira kao "abort-like" i ne prikazuje korisniku.
- Auth logs (zadnja 2 sata) pokazuju samo `200 OK` na `/user`, `/token` te uspješne `Login` evente za 2 različita korisnika. Nema 4xx/5xx.
- Runtime errors snapshot: prazan.

**Zaključak:** "/auth runtime error" iz prethodnog audita je bio false alarm — poruka postoji u kodu samo kao filter, a ne kao stvarna greška. Nema šta popravljati u Auth flow-u po toj osnovi.

Akcija: ukloniti tu stavku s liste blockera prije launcha.

## 2. Stvarni warning koji vidimo u konzoli

Console log:
```
Warning: Function components cannot be given refs.
Check the render method of `PopoverContent`.
... at BusinessProfileSwitcher.tsx:32
```

Ovo je React forwardRef warning u `BusinessProfileSwitcher` — ne ruši app, ali zagađuje dev konzolu i može maskirati prave greške tijekom QA. Popravit ću tako da se `PopoverTrigger asChild` koristi nad ispravnim children-om (ili dodati `forwardRef` u custom wrapper).

## 3. Regression smoke test checklist (kreirati kao `docs/PRE_LAUNCH_REGRESSION.md`)

Lista konkretnih putanja za ručnu provjeru, fokus na nedavno mijenjano:

**Auth / Onboarding**
- Email signup → email verify → onboarding usage_profile (finance_only / finance_projects)
- Google OAuth na webu i nativeu
- Logout → login zadržava aktivni business profil

**Projekti (najveći adut — nedavne promjene)**
- Kreiranje projekta s preset tipom (svih 13)
- "Tim projekta" tab: members / workers / collaborators podtabovi
- Project status line na karticama (paused/justStarted/inProgress/nearEnd)
- Project completion wizard (3 koraka) → archive / reopen
- Funding vs actual P&L izračun

**Naplata / Paywall (upravo refaktorirano)**
- Free → Pro upgrade flow (Stripe checkout + 5s polling)
- Lifetime tier dostupnost banner
- Sve i18n stringovi prikazani u HR / EN / DE
- Feature gating: useFeatureAccess granice (recurring, multi-currency, scan)

**Mobile / native**
- BottomNav redoslijed s usage_profile
- Receipt scanner: capture → process → save (Personal i Business)
- Back button handling u dijalozima

**Admin / Pulse**
- Funnel events widget
- Feedback submissions tablica

## 4. Tehničke izmjene koje ću napraviti

### a) `src/components/BusinessProfileSwitcher.tsx`
Popraviti React ref warning oko `PopoverContent` / `PopoverTrigger`. Vjerojatno treba `forwardRef` na custom child ili `asChild` ispravno propagirati ref.

### b) `docs/PRE_LAUNCH_REGRESSION.md` (novi file)
Strukturirana checklist iz točke 3, s checkbox stavkama, odgovornom osobom (ti) i statusom (✅ / ⚠️ / ❌). Hrvatski jezik, jer je za internu upotrebu prije launcha.

### c) Bez izmjena na:
- `useAuth.ts` — radi ispravno
- `Auth.tsx` — radi ispravno
- `sentry.ts` / `diagnosticLogger.ts` — filtri su namjerno postavljeni

## 5. Što NE radim u ovom koraku
- Redizajn landinga (to je opcija B u idućem koraku)
- Demo projekt onboarding (opcija C)
- Nove feature

## Ishod
- Konzola čista od "Function components cannot be given refs" warninga
- Pisani regression checklist koji možeš proći prije nego klikneš "Publish"
- Potvrda da `/auth` nije blocker
