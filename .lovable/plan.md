# Plan: 3-slojni push notification model

## Cilj

Smanjiti notification fatigue grupiranjem broadcast/suradničkih pusheva u jedan dnevni digest u **19:00 lokalno**, uz zadržavanje:
- **instant** pusheva za vremenski osjetljive evente
- postojećeg **daily summary** vlastite potrošnje u **21:00 lokalno** (nepromijenjeno)

## Slojevi (finalna klasifikacija)

### Sloj 1 — INSTANT (ostaje real-time)
Zadržavaju trenutni push, ne diraju se:
- `notify-budget-shared` / `notify-project-shared` / `notify-family-invitation` / `send-member-invitation` — pozivnice
- `notify-note-added` kad je @mention (direktno spominjanje)
- `check-milestone-deadlines` — deadline danas/sutra
- Account/security eventi (password reset, login alert)
- Krug deletion vote requests

### Sloj 2 — DIGEST u 19:00 lokalno (NOVO, zamjenjuje real-time)
Sve broadcast/suradničke aktivnosti idu kroz postojeći `participant_digest_state` mehanizam:
- `notify-project-transaction` (već enqueue-a)
- `notify-project-activity` (već enqueue-a)
- `notify-note-added` bez @mentiona (TREBA prebaciti s instant na enqueue)
- Family aktivnost (novi enqueue path za `family_activity`)
- Budget shared activity (nove transakcije u shared budgetu)

### Sloj 3 — DAILY SUMMARY u 21:00 lokalno (NEPROMIJENJENO)
`send-daily-summary` ostaje točno kako je sada. Nema preklapanja s 19:00 jer su 2h razmaka i potpuno različite teme (vlastita potrošnja vs aktivnost drugih).

## Tehničke promjene

### A. Cron — pomak postojećeg flush-a s 19:00 UTC na 19:00 lokalno
Trenutno: `flush-participant-digest-daily` cron radi u **19:00 UTC** (fiksno). To znači da u HR ljeti puca u 21:00 lokalno → sudara se s daily summaryjem.

Promjena:
- Cron pucati **svaki sat** (poput `send-daily-summary`)
- Edge function dodaje filter: pošalji samo korisnicima čije lokalno vrijeme je trenutno 19:00 (čita `profiles.timezone`, ista logika kao `send-daily-summary`)
- Po (user, project) i dalje min interval 20h (guard ostaje)
- Empty-digest skip ostaje (već implementirano)

### B. Migracija novih event tipova u digest
- `notify-note-added`: kad poruka **NIJE** @mention i nije od managera koji direktno traži pažnju → `enqueue_participant_digest_event` umjesto `sendPushNotificationToMany`
- Family aktivnost: novi enqueue path (analogno project digestu), zasebna tablica `family_digest_state` (mirror sheme) ili reuse generičkog mehanizma — odluka u implementaciji
- Budget aktivnost: analogno

### C. Korisničke postavke (minimum viable)
U `NotificationsSection`:
- Toggle "Sažetak aktivnosti suradnika" (on/off) — gasi sloj 2
- Vrijeme sažetka — slider/select (default 19:00, opcije 17/18/19/20)
- Per-projekt mute ostaje izvan ovog plana (odgodit ćemo)

### D. Telemetrija
- Funnel event `digest_sent` (već postoji indirektno kroz logove) — dodati formalni `funnel_events` red sa source='participant_digest'
- Brojiti open rate (push tap → app open) za usporedbu s prijašnjim instant modelom

## Što se NE radi u ovom planu
- Per-projekt mute (odgoda)
- Quiet hours napredne postavke (odgoda)
- Threshold "pošalji ranije ako >N evenata" (odgoda — krećemo s čistim 19:00, mjerimo)
- Promjena `send-daily-summary` u 21:00 (ostaje točno kako je)

## Redoslijed implementacije

1. Pomak `flush-participant-digest` na hourly cron + tz-aware filter (čitanje `profiles.timezone`)
2. Migracija `notify-note-added` (bez mentiona) na enqueue
3. Family digest enqueue path
4. Budget digest enqueue path
5. UI toggle + vrijeme u `NotificationsSection`
6. Telemetrija `funnel_events`

## Verifikacija
- Vitest za novu tz-filter logiku (reuse helpera iz `send-daily-summary`)
- Manual test kroz postojeći `test:true` mode u `flush-participant-digest`
- Provjera da `send-daily-summary` u 21:00 nije dirnut
