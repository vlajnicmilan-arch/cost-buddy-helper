## Per-user scope za WelcomeChecklist dismiss flag

### Problem
`WelcomeChecklist` koristi globalni `localStorage` ključ `welcome_checklist_dismissed`. Kad se na istom uređaju prijavi novi korisnik (npr. tactura.hr nakon već postojeće sesije), banner se ne prikazuje iako bi trebao — flag iz prošle sesije ga gasi. Vidi se kao prazan prostor između trial banera i payment sources sekcije.

### Promjena
`src/components/WelcomeChecklist.tsx`:
- Uvesti `useAuth` da dobijemo `user.id`.
- Promijeniti localStorage ključ na `welcome_checklist_dismissed:${user.id}` (prefix konstanta `DISMISS_KEY_PREFIX`).
- Ako `user?.id` još nije dostupan, ne čitamo i ne pišemo flag (banner se neće dismisati prerano).
- Auto-dismiss pri `allDone` također piše per-user ključ.

### Što ne radimo
- Ne diramo postojeće globalne ključeve (legacy `welcome_checklist_dismissed`) — neće praviti štetu, jednostavno se više ne čita.
- Bez DB migracije, bez novih i18n ključeva.
- Bez izmjena u logout flowu — per-user scope je dovoljan.