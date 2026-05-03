## Problem

Kod Google prijave preglednik automatski koristi zadnji prijavljeni Google račun bez prikaza dijaloga za odabir. Ako korisnik ima više Google računa, ne može izabrati s kojim se želi prijaviti.

## Uzrok

U `src/pages/Auth.tsx` `lovable.auth.signInWithOAuth("google", ...)` se poziva bez `prompt` parametra. Lovable Cloud / Google OAuth podržavaju `extraParams.prompt: "select_account"` koji prisilno prikazuje izbornik računa.

Isto vrijedi i za nativnu prijavu u `src/hooks/useNativeOAuth.ts`.

## Promjene

1. `src/pages/Auth.tsx` (linija ~626) — Google OAuth poziv:
   ```ts
   await lovable.auth.signInWithOAuth("google", {
     redirect_uri: `${window.location.origin}/app`,
     extraParams: { prompt: "select_account" },
   });
   ```

2. `src/hooks/useNativeOAuth.ts` (linija ~27) — isti `extraParams: { prompt: "select_account" }` za Google (samo kad je provider === 'google').

Apple ne treba ovaj parametar (Apple ima vlastiti tijek).

## Rezultat

Pri svakom kliku na "Nastavi s Google računom" Google će prikazati listu svih prijavljenih računa i ponuditi opciju "Use another account", pa korisnik može slobodno birati s kojim računom se prijavljuje u V&M Balance.
