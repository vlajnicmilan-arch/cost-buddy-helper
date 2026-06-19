Reset test korisnika `hr.akrobat@gmail.com` u stanje "novi korisnik":

1. `UPDATE profiles SET onboarding_completed = false, guided_home_exited_at = NULL` za tog usera
2. `DELETE FROM expenses WHERE user_id = <hr.akrobat>`
3. Verifikacija: SELECT pokazuje `onboarding_completed=false`, `guided_home_exited_at=NULL`, 0 unosa

Bez promjena koda.