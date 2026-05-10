## Problem

U `NotificationsDropdown.tsx` gumb za brisanje (Trash2) na svakoj obavijesti je skriven s `opacity-0 group-hover:opacity-100`. Na mobitelu nema hover statusa pa ga korisnik nikad ne vidi. Nakon klika na delete dropdown ostaje otvoren — korisnik mora ručno klikati izvan da se zatvori.

## Rješenje (samo UI, bez nove logike)

Datoteka: `src/components/NotificationsDropdown.tsx`

1. **Učiniti delete (i mark-as-read) gumbe trajno vidljivima** — maknuti `opacity-0 group-hover:opacity-100` s wrappera. Ostavlja se ista pozicija desno, samo bez hover trika. Touch target ostaje 44×44 (već je tako).
2. **Auto-zatvaranje dropdowna nakon delete** — u `onClick` Trash2 gumba dodati `setOpen(false)` nakon poziva `deleteNotification(...)`. Isti pattern već postoji za navigaciju (`setOpen(false)` u `handleNotificationClick`).
3. **i18n** — gumbi su ikonski (Trash2, Check), nema teksta za prevesti. Dodaje se `aria-label` preko postojećih ključeva `notifications.delete` / `notifications.markRead` (ako ne postoje, dodaje se u `hr.json`, `en.json`, `de.json`).

## Što NE diram

- Invitation AlertDialog (taj prozor ima svoju decline/accept logiku, korisnikov problem nije tamo)
- `useNotifications` hook
- Edge funkcije / DB

## Rizik

Praktički nikakav — promjena samo CSS klasa + jedan `setOpen(false)` poziv.
