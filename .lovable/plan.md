## Opseg

Samo jedna izmjena. Ništa drugo se ne dira — bez backfilla, bez edge function promjena, bez auto-create radnika.

## Problem

Kad korisnik s `project_members.role = worker` otvori "Dnevnik rada" na projektu gdje vlasnik još nije kreirao odgovarajući `project_workers` zapis (s `user_id = njegov`), `MyWorkerPayCard` se uopće ne prikazuje. Korisnik ne zna je li to bug, propust ili namjera.

Točno se to dogodilo Petru na projektu "Lucija i Mate" — riješeno tek kad je vlasnik ručno dodao Petra kao radnika.

## Rješenje

U `src/components/projects/ProjectWorkLogTab.tsx`, blok:

```tsx
{myWorker && !isManager && ( <MyWorkerPayCard ... /> )}
```

zamijeniti s granom koja, kad `myWorker` ne postoji a korisnik nije manager, prikazuje istu `Card` ljusku (`border-primary/30 bg-primary/5`) s jednom rečenicom objašnjenja umjesto kartice satnice.

Tekst (i18n, novi ključ `workLog.myPay.notLinkedYet`):

> *"Vlasnik te još nije dodao kao radnika na ovom projektu. Zarada će se prikazati nakon što ti postavi satnicu."*

Bez CTA, bez gumba, bez ikone "fix me". Samo objašnjenje da kartice nema namjerno.

## Tehnički detalji

- **Datoteka:** `src/components/projects/ProjectWorkLogTab.tsx` — samo render blok oko linije 210.
- **Nova komponenta:** nije potrebna. Može se napraviti inline mali `Card` ili (čišće) proširiti `MyWorkerPayCard` da prima `hourlyRate?: number | null` i kad je `null` renderira "not linked" varijantu. Predlažem drugu opciju zbog konzistentnog stylinga.
- **i18n:** dodati ključ `workLog.myPay.notLinkedYet` u `hr.json`, `en.json`, `de.json`.
- **Bez DB izmjena, bez edge function izmjena, bez migracija.**
- **Gating:** prikazati samo kad `!isManager && canLogOwnWork` (znači: stvarni worker, ne participant/viewer).

## Što se NE radi

- Nema auto-create `project_workers` retka na accept invitation.
- Nema backfill migracije za postojeće slučajeve (Petar je već ručno riješen).
- Nema promjene odnosa `project_work_logs` ↔ `project_work_entries`.

Ostavljamo eksplicitan model: vlasnik mora svjesno dodati radnika i postaviti satnicu. UI samo prestaje šutjeti kad to još nije učinjeno.