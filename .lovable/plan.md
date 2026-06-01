## Problem

Kad upišeš vlastiti mail za pozivnicu na budžet, edge funkcija `send-member-invitation` vraća HTTP 400 s tijelom `{"error":"already_member"}`. `supabase.functions.invoke` na non-2xx baca grešku i klijent NIKAD ne dođe do grane `if (data.error === 'already_member')` — umjesto toga ide u `catch` i prikazuje sirovo `Edge function returned a non-2xx status code`.

Isti obrazac postoji u 5 mjesta koja koriste istu funkciju:
- `BudgetMembersTab.tsx`
- `ProjectMembersTab.tsx`
- `ProjectWorkerDialog.tsx`
- `PaymentSourceMembersDialog.tsx`
- `FamilyGroupDetailView.tsx`

## Uzrok

Edge funkcija vraća `status: 400` za poslovne (očekivane) greške: `already_member`, `already_invited`, `user_not_found`. To su **valjani odgovori**, ne tehnički failure → trebaju biti `status: 200` s `error` poljem u JSON-u (klijenti to već očekuju).

## Plan

**Edge funkcija `send-member-invitation/index.ts`** — za 3 poslovne greške promijeniti `status: 400` u `status: 200`:
- `user_not_found` (linija 86)
- `already_member` (linija 164)
- `already_invited` (linija 181, 197)

Sve ostale (auth/validation/500) ostaju 4xx/5xx.

**Klijent** — nije potrebno mijenjati. Postojeći switch (`data.error === 'already_member'` → lokaliziran toast) već radi.

## Provjera

Nakon deploya: upiši svoj mail u "Pozovi člana" → očekivani feedback: lokaliziran toast "Korisnik je već član", bez raw "Edge function returned…" poruke.

## Što NE diram

- Klijentske komponente
- i18n ključeve (već postoje `budget.alreadyMember` itd.)
- RPC `find_user_by_email` (radi ispravno prema logovima)
