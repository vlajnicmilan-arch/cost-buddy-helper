

## Ispravak push obavijesti za projektne transakcije — pravi uzrok pronađen

### Što sam stvarno provjerio (nije nagađanje)

Pregledao sam `app_diagnostics_logs` tablicu i `useExpenseCRUD.ts`. Dokaz:

1. **Frontend uredno zove** `notify-project-transaction` (zadnji poziv prije 11 minuta, ukupno 12 poziva jutros) — vidljivo u `notify_invoke_started` događajima.
2. **Svaki poziv odbija Supabase gateway prije nego stigne do funkcije** s greškom `401 UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM — "Unsupported JWT algorithm ES256"`.
3. **Edge function logs su prazni** za `notify-project-transaction` — funkcija se nikad nije pokrenula jer ju gateway odbija.

### Pravi uzrok

Supabase je migrirao project JWT signing na **ES256 asimetrične ključeve**. Edge funkcije s `verify_jwt = true` ne podržavaju taj algoritam u trenutnoj konfiguraciji. Funkcija se zove točno, ali gateway zaustavi zahtjev na 401 prije nego dosegne `Deno.serve(...)`.

Iste sumnje vrijede i za druge `notify-*` funkcije koje pozivaju s korisničkim tokenom (notify-pending-transaction, notify-note-added, notify-family-message).

### Ispravak (jedna izmjena)

Dodati u `supabase/config.toml` blok za svih 5 user-invoked notify funkcija s `verify_jwt = false`. Funkcije već **interno** validiraju JWT preko `supabaseUser.auth.getClaims(token)` (vidim u kodu na liniji 41), tako da **nema sigurnosnog gubitka** — samo skidamo gateway-level provjeru koja sad fail-a zbog ES256.

```toml
[functions.notify-project-transaction]
verify_jwt = false

[functions.notify-pending-transaction]
verify_jwt = false

[functions.notify-note-added]
verify_jwt = false

[functions.notify-family-message]
verify_jwt = false

[functions.notify-payment-source-transaction]
verify_jwt = false
```

### Verifikacija nakon ispravka

1. Deploy 5 funkcija
2. Korisnik napravi novu projektnu transakciju
3. Provjerim `app_diagnostics_logs` → `notify_invoke_ok` (status 200)
4. Provjerim edge function logs → vidi se izvršenje
5. Provjerim `push_delivery_logs` → `dispatch_ok` za Test uređaj
6. Test uređaj prima push

### Što ostaje netaknuto

- Cron-pozvane funkcije (`check-budget-alerts`, `check-reminders`, `check-milestone-deadlines`, `trial-reminder`) — već imaju `verify_jwt = false` ili koriste service role, rade ispravno
- `send-push` interna funkcija — ne dira se
- Sva ostala logika notify funkcija — interno validiranje JWT-a ostaje

### Trajanje
~3 minute (1 izmjena `config.toml` + deploy)

