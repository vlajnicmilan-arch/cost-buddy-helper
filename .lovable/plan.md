
# Popravak nedostajućih i18n ključeva u `common` namespace-u

## Problem (potvrđen)

Na ekranu kreiranja projekta vide se sirovi ključevi (`common.select`, `common.create`) jer ne postoje u `common` bloku ni u jednom od tri jezika. Cijeli set ključeva koji se već koriste po project komponentama, ali fale u svim jezicima:

```
create, select, copied, optional, note, status, view, print, reject,
saved, exported, export, show, showLess, showMore, understood,
clearAll, confirmDelete
```

Dodatno samo `hr.json` nema: `icon`, `color`, `balance`, `you` (en/de imaju).

## Što ću napraviti

Dodati nedostajuće ključeve u `common` blok u sva tri jezika (`hr.json`, `en.json`, `de.json`). Bez ikakvih promjena u kodu komponenti — ključevi se već zovu na ispravan način, samo nisu definirani.

### Vrijednosti

| ključ | hr | en | de |
|---|---|---|---|
| create | Kreiraj | Create | Erstellen |
| select | Odaberi | Select | Auswählen |
| copied | Kopirano | Copied | Kopiert |
| optional | neobavezno | optional | optional |
| note | Napomena | Note | Notiz |
| status | Status | Status | Status |
| view | Pregled | View | Ansehen |
| print | Ispiši | Print | Drucken |
| reject | Odbij | Reject | Ablehnen |
| saved | Spremljeno | Saved | Gespeichert |
| exported | Izvezeno | Exported | Exportiert |
| export | Izvezi | Export | Exportieren |
| show | Prikaži | Show | Anzeigen |
| showLess | Prikaži manje | Show less | Weniger anzeigen |
| showMore | Prikaži više | Show more | Mehr anzeigen |
| understood | Razumijem | Got it | Verstanden |
| clearAll | Očisti sve | Clear all | Alles löschen |
| confirmDelete | Jeste li sigurni da želite obrisati? | Are you sure you want to delete? | Möchten Sie wirklich löschen? |
| icon | Ikona | (postoji) | (postoji) |
| color | Boja | (postoji) | (postoji) |
| balance | Stanje | (postoji) | (postoji) |
| you | Ti | (postoji) | (postoji) |

## Tehnički

Tri `code--line_replace` poziva — jedan po jeziku, umetanje na vrh `common` bloka odmah nakon `"save"`. Nema schema/DB promjena, nema novih komponenti, nema utjecaja na ostatak aplikacije.
