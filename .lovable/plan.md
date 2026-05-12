## 2 koraka

### 1. `.env` → `.gitignore`

Trenutni `.gitignore` ima samo `*.local`. Dodajem nakon `*.local`:

```
# Env files
.env
.env.local
.env.*.local
```

### 2. Rotacija Supabase ključeva

Pokrećem `supabase--rotate_api_keys` tool — automatski:
- generira nove `anon` + `service_role` ključeve
- ažurira `.env` (`VITE_SUPABASE_PUBLISHABLE_KEY`)
- ažurira interne secrets
- onemogući stare ključeve

**Važno:** `anon`/publishable ključ je dizajniran da bude javan (zaštićen RLS-om), tako da curenje nije security incident — ali rotacija je ok ako želiš čistu situaciju. Nakon rotacije:
- web/PWA: radi automatski (novi `.env` u buildu)
- **Android APK 1.0.5 i stariji**: ima stari ključ ugrađen u bundle → **prestaje raditi** dok korisnik ne update-a na 2.0.0 (koji će se buildati s novim ključem)

### Napomena o git trackingu

Ako je `.env` već commitan u git historiji (a vjerojatno je), dodavanje u `.gitignore` ne briše ga iz history-ja. Ako želiš i to očistiti, trebaš lokalno:
```bash
git rm --cached .env
```
i commit-ati. Ja to ne mogu pokrenuti — git operacije su tvoje.

---

**Pitanje prije izvršenja:** jesi li svjestan da rotacija ključa lomi sve starije APK-ove (1.0.5 i ispod)? Ako da, idem dalje. Ako ne, možemo:
- (A) prvo buildati 2.0.0 s **trenutnim** ključem, pa rotirati tek kad većina pređe
- (B) rotirati odmah (sad) i forsirati update na 2.0.0
