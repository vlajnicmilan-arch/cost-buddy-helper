# Ograničavanje pristupa radnika u projektu

## Stanje
Logika za restriktivnu rolu **već postoji**:
- `ProjectRole` tip uključuje `'worker'` (src/types/project.ts)
- `ProjectFullScreenView` ima `isWorkerOnly = role === 'worker' && !isManager` koji sakriva sve tabove osim **Dnevnika rada** (linije 105–141)
- i18n ključ `projectRoles.worker` postoji u HR/EN/DE
- RPC za promjenu role (`updateMemberRole`) radi za bilo koju ProjectRole vrijednost

## Problem
UI u `ProjectMembersTab.tsx` nudi **samo `member` i `viewer`** u tri Select-a (poziv mailom, generiranje linka, promjena role postojećeg člana). Zato je tvoja osoba dobila default `member` koji vidi overview, funding, ugovoreni iznos itd.

## Izmjena (minimalna, samo UI)

Datoteka: `src/components/projects/ProjectMembersTab.tsx`

1. U sva 3 `<Select>` (linije 411, 437, 505) dodati novi `SelectItem`:
   ```tsx
   <SelectItem value="worker">{t('projectRoles.worker', PROJECT_ROLE_LABELS.worker)}</SelectItem>
   ```

2. Proširiti `defaultPermsForRole` (linija 44) tako da za `worker` vrati sve `false` (defense in depth — FullScreenView ionako hard-codira, ali da `project_member_permissions` zapisi ne ostanu permisivni ako se rola kasnije promijeni):
   ```ts
   if (role === 'worker') {
     return { overview: false, milestones: false, workers: false, collaborators: false, funding: false, transactions: false };
   }
   ```

3. Opcionalno: kratak hint ispod role select-a kad je odabran `worker` (npr. `t('projects.workerRoleHint', 'Vidi samo Dnevnik rada')`) — dodati i ključ u sva 3 i18n fajla.

## Što ne mijenjamo
- Bez DB migracije (rola već prolazi kroz `role text` kolonu)
- Bez izmjene RLS-a (FullScreenView je jedini ulaz u projekt; ostali resursi su zaštićeni postojećim policies)
- Bez izmjene `linkWorkerToMember` flowa — sinkronizacija dnevnika rada nastavlja raditi

## Korak za tvoju trenutnu situaciju (nakon implementacije)
Otvori projekt → **Tim projekta → Članovi** → kraj imena tog korisnika promijeni rolu iz **Član** u **Radnik**. Na njegovom uređaju nestanu svi tabovi osim Dnevnika rada.

## Otvoreno pitanje
Da li želiš još jednu razinu — npr. **"Radnik + Faze"** (vidi i milestones da zna na čemu radi, ali ne i novce)? Trenutno je `worker` samo Dnevnik rada. Ako da, mogu dodati zasebnu rolu ili koristiti per-tab `project_member_permissions` za `member` rolu (već postoje, samo treba UI). Reci prije implementacije.
