
Dijagnoza

Našao sam točnu grešku: problem nije u publishu niti u pristupu, nego u tome što je Šihterica spojena na krivu komponentu.

```text
Stvarni flow koji app koristi:
 /index -> BusinessProjects / ProjectsPanel -> ProjectFullScreenView
                                            -> Šihterica NE postoji

Mjesto gdje je Šihterica trenutno dodana:
 ProjectDetailDialog -> Šihterica postoji
```

Zato je ne vidiš ni kad su Tactura, projekt i pristupi ispravno uključeni. `BusinessProjects` i `ProjectsPanel` oba otvaraju `ProjectFullScreenView`, a on trenutno nema `TimeClockTab` ni trigger za tab.

Plan popravka

1. U `src/components/projects/ProjectFullScreenView.tsx` dodati:
   - `TimeClockTab` import
   - `TabsTrigger` za “Šihterica”
   - `TabsContent` koji renderira `TimeClockTab`

2. Uvesti isti uvjet vidljivosti za šihtericu u oba project prikaza, npr. zajednički `canAccessTimeClock`, da se logika više ne razilazi.

3. Uskladiti ova dva filea da imaju isti business/time-clock tab set:
   - `src/components/projects/ProjectFullScreenView.tsx`
   - `src/components/projects/ProjectDetailDialog.tsx`

4. Zadržati postojeći access gate za sada (`isBusinessView && hasAccess('workforce')`), jer trenutni blocker nije pretplata nego to što se tab uopće ne renderira u glavnom project viewu.

5. Nakon popravka provjeriti oba stvarna ulaza:
   - `/index` → poslovni projekti → otvori projekt
   - `/projects` → otvori projekt

Datoteke
- `src/components/projects/ProjectFullScreenView.tsx`
- `src/components/projects/ProjectDetailDialog.tsx`

Tehnička napomena
- Nema potrebe za migracijom baze ni RLS izmjenama za ovaj bug.
- Ako nakon ovoga želiš, u sljedećem koraku mogu odvojiti šihtericu od Business-only pristupa i dati joj zaseban feature gate, ali to nije uzrok trenutnog problema.

Očekivani rezultat
- Šihterica će se napokon pojaviti u stvarnom project prozoru koji koristi objavljena aplikacija.
