Razumijem nervozu. Provjerio sam stvarno stanje umjesto nagađanja i sada imamo konkretan uzrok.

Što sam provjerio:
- Objavljena stranica je public, nije zaključana privatnim publish postavkama.
- Backend auth logovi pokazuju da Google prijava sada uspijeva: postoji recent `login_method: oidc`, `provider: google`, status 200.
- Nema više auth grešaka tipa `failed to sign in with vendor` ili `Unacceptable audience` u recent logovima.
- App trenutno Google OAuth pokreće s `redirect_uri: window.location.origin`, što znači da se nakon Google prijave vraća na `https://vmbalance.com/`.
- `src/main.tsx` ima “fast landing” optimizaciju: ako je putanja `/`, direktno renderira Landing stranicu i uopće ne učitava `App.tsx`, auth state ni routing.

Zaključak:
Google prijava više ne pada na backendu. Problem je frontend boot logika: uspješna prijava se vraća na `/`, a `/` kod objavljene stranice namjerno učita samo landing, pa korisnik izgleda kao da nije prijavljen.

Plan popravka:

1. Promijeniti OAuth redirect za Google i Apple login
- U `src/pages/Auth.tsx` promijeniti redirect iz:
  - `window.location.origin`
- u:
  - `${window.location.origin}/app`
- Tako se nakon Google odabira računa aplikacija vraća na app entry route, ne na landing.

2. Ojačati `src/main.tsx` fast-landing logiku
- Fast landing smije ostati za obične posjetitelje na `/`, ali ne smije preskočiti aplikaciju ako postoji auth povratak ili spremljena auth sesija.
- Dodati provjeru prije fast landing rendera:
  - ako URL hash/query sadrži auth podatke ili auth grešku, učitati puni `App.tsx`
  - ako localStorage već ima Supabase/Lovable auth session key, učitati puni `App.tsx`
- Time se izbjegava ponavljanje problema čak i ako neki OAuth callback ipak završi na root URL-u.

3. Ne dirati više backend/OAuth provider postavke
- Trenutni logovi pokazuju da Google provider radi.
- Daljnje resetiranje provider postavki bi samo povećalo rizik i trošilo vrijeme.

4. Nakon implementacije
- Objaviti frontend update, jer su ovo client-side promjene.
- Testirati na `https://vmbalance.com/auth` u inkognito prozoru.
- Očekivani rezultat: nakon odabira Google računa završavaš na `/app`, zatim `/home` ili `/onboarding`, ovisno o stanju onboardinga.

Ovo je mali i ciljano ograničen popravak u 2 datoteke, bez migracija i bez novih auth eksperimenata.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>