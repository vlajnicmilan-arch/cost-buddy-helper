# Plan: Sve projektne push obavijesti se sabiru i šalju u 19h

## Cilj
Telefon više ne zvoni za svaku transakciju, dnevnik, milestone-izmjenu ili promjenu u dijeljenom projektu/budžetu/krugu/dijeljenom računu. Sve te događaje skupljamo i šaljemo **jednim push-om u 19h** lokalno (po korisniku). Osobne financije ostaju **21h** kao i dosad.

## Što se mijenja konceptualno
- Trenutno (sloj 1): owner i Projects subscriberi (full members) dobivaju **instant push**. Samo "Core participanti" (members bez vlastite Projects pretplate) idu u 19h digest.
- Novo: **svi primatelji** projektnih događaja idu u 19h digest. Sloj "subscriber → instant" se uklanja.

## Iznimke (i dalje stižu odmah)
Po tvojoj odluci, odmah ostaju samo:
1. **Pozivnice** (projekt, budžet, dijeljeni račun, krug, dijeljeni izvor) — bez njih korisnik ne može prihvatiti suradnju.
2. **Budget alerti** (prekoračenje praga budžeta / milestone budžeta) — financijski rizik, mora biti odmah.
3. **Reminderi** koje je korisnik **sam** zakazao (`check-reminders`) — to je njegov vlastiti budilnik.

Sve ostalo (nove transakcije, dnevnici, izmjene milestonea, promjene plana, aktivnost u dijeljenom izvoru, krug događaji) — **batch u 19h**.

## In-app zvonce
Ostaje odmah. Svaki događaj i dalje pravi `notifications` redak istog trenutka, pa kad otvoriš app vidiš sve s točnim vremenom. Push (banner na zaključanom ekranu) je jedini koji se odgađa.

## Tehnička izvedba

### A) Postojeća infrastruktura koju ponovno koristimo
- `enqueue_participant_digest_event` RPC + `participant_digest_state` tablica (već postoji).
- `flush-participant-digest` edge funkcija već radi po satu i šalje u korisnikov lokalni 19h (default `Europe/Zagreb`, configurable u `notification_preferences.participant_digest_hour`).
- `splitInstantVsDigest` helper već dijeli primatelje.

### B) Konkretne izmjene u edge funkcijama
Za svaku funkciju ispod: ukloniti `sendPushNotificationToMany`/`sendPushNotification` poziv, ostaviti samo `notifications` insert + `enqueue_participant_digest_event` za svakog primatelja:

1. `notify-project-transaction` — ukinuti instant push, svi primatelji u digest.
2. `notify-project-activity` — isto.
3. `notify-note-added` — isto (provjeriti sve grane: project notes, transaction notes).
4. `notify-payment-source-transaction` — isto (dijeljeni računi).
5. `notify-pending-transaction` — isto.
6. (Krug ekvivalenti, ako postoje pushevi pri akciji — isto.)

### C) Funkcije koje OSTAJU instant (ne diramo)
- `send-member-invitation`, `accept-project-invitation`, `respond-to-invitation` — pozivnice.
- `check-budget-alerts`, `check-milestone-budgets` — budget prekoračenje (NAPOMENA: `check-milestone-budgets` već zove digest enqueue; tu treba ostaviti i instant push za sam alert, ali enqueue digest za "info" događaje koje već dodaje).
- `check-reminders` — vlastiti podsjetnici.
- `notify-app-update`, `broadcast-notification`, `activation-nudge` — sistemski, ostaju kako jesu.

### D) Proširenje `flush-participant-digest`
Sada šalje "X novih promjena u projektu". Trebalo bi pokriti i:
- Dijeljene račune (payment source) — dodati group key osim `project_id`, ili reuse istog mehanizma s drugim "scope" poljem.
- Krug aktivnost (ako se uvodi push).

Ako želiš da ovo bude minimalan first cut, prva iteracija pokriva samo projekte (najveći izvor buke); dijeljeni računi i krug u drugoj iteraciji. **Predlažem first cut samo projekti** da ne otvaramo previše naraz.

### E) Postavke (Settings → Obavijesti)
- Ukloniti / sakriti opciju "instant push za pretplatnike Projects modula" ako postoji.
- Zadržati `participant_digest_hour` postavku (default 19) tako da korisnik može pomaknuti vrijeme ako želi.
- Dodati kratak opis: "Sve promjene u dijeljenim projektima skupljamo i šaljemo jednom dnevno u 19h. Pozivnice, podsjetnici i upozorenja o prekoračenju budžeta i dalje stižu odmah."

### F) Migracija postojećih korisnika
Nema schema promjene; samo se mijenja ponašanje edge funkcija. Postojeći digest state ostaje važeći.

## Što se NE mijenja
- 21h dnevni summary za osobne financije (`Daily Summary Push`) ostaje.
- In-app zvonce / `notifications` tablica logika.
- Budget alerti, pozivnice, vlastiti podsjetnici — i dalje instant.
- Token dedup bug iz prethodne diskusije i dalje treba popraviti (zaseban plan); inače će push za Vinku završiti na tvom telefonu — ali sada **u 19h** umjesto odmah. Treba ga riješiti paralelno.

## Test scenarij nakon implementacije
1. Napraviš transakciju u dijeljenom projektu u 14h → tvoj telefon: nema pusha. Vinkin telefon: nema pusha. U 19h Vinka dobiva: "3 novih promjena u projektu Renovacija: Milan · transakcija · Boja".
2. Vinka prekorači budžet milestone-a → odmah dobiva push "Budžet prekoračen" (iznimka).
3. Pošalješ Vinki pozivnicu za novi budžet → odmah dobiva push (iznimka).
4. Tvoj vlastiti reminder u 09:00 → zvoni u 09:00 (iznimka).
