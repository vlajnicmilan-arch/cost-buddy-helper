## Problem
Na mobitelu, kad član klikne "Više" u projektu, otvara se `Sheet` s listom svih sekcija ("Sve sekcije"). Sadržaj se ne skrolira i preraste viewport — vidljive su samo 2 stavke (Dokumenti, pola Aktivnosti), ostatak (Procjene, Računi, Rizici, …) je odsječen i nedostupan.

## Uzrok
`src/components/ui/sheet.tsx` — `sheetVariants` za `side: "bottom"` ima samo `inset-x-0 bottom-0 border-t` bez ikakvog max-height ni overflow pravila. Visina raste s sadržajem dok ne prijeđe vrh viewporta, ali nema scrolla pa korisnik ne može doći do donjih stavki.

`MobileProjectTabs.tsx` `SheetContent` također nema `max-h` ni `overflow`.

## Rješenje (minimalno, samo UI sloj)

### 1. `src/components/ui/sheet.tsx`
Dodati u `sheetVariants` `side.bottom` default ponašanje:
- `max-h-[85svh]` (svh radi ispravno s mobilnim adresnim trakama; fallback nije nužan)
- `overflow-y-auto`
- `flex flex-col` (da `SheetHeader` ostane na vrhu, a lista skrola ispod)

Ne diram `top/left/right` varijante.

### 2. `src/components/projects/MobileProjectTabs.tsx`
`SheetContent` za "Sve sekcije" obaviti listu u skrolabilni kontejner:
- `SheetHeader` ostaje sticky-like na vrhu (jednostavno: kao prvi child)
- Lista (`<div className="mt-4 flex flex-col gap-1">`) dobiva `overflow-y-auto` i `pb-safe` da zadnja stavka nije skrivena ispod Android nav bara.

Konkretno: dodati `flex flex-col` + `max-h-[85svh]` na `SheetContent` (overrida default ako default već postoji u sheet.tsx — onda samo dodati `pb-[max(env(safe-area-inset-bottom),1.5rem)]`).

## Verifikacija
- Otvoriti projekt kao član, kliknuti "Više" na viewportu 384×705 → lista se mora moći skrolati do zadnje stavke i Android system bar ne smije pokrivati zadnji item.
- Vlasnik na istom projektu također otvori "Više" → ista lista, isto ponašanje.
- Desktop ostaje netaknut (`sm:hidden` na MobileProjectTabs, side="right" varijanta sheet-a nepromijenjena).

## Što NE diram
- Read-only banner ("Projekti su u načinu samo za pregled") — ostaje kako je.
- Sadržaj/popis sekcija u overflow listi — ne mijenjam koje su sekcije vidljive članu.
- Bilo kakvu poslovnu logiku, role, RLS.
