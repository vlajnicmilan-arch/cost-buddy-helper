

## Problem: Duplikacija projekta i gubitak podataka pri migraciji

### Bug 1: Projekt se duplicira u osobnom modu

**Uzrok**: U `fetchProjects` (linija 64-76), dohvat "dijeljenih projekata" (gdje je korisnik član putem `project_members` tablice) **ne filtrira po `business_profile_id`**.

Tok problema:
1. Korisnik migrira projekt → `business_profile_id` se postavi
2. `fetchProjects()` se pozove
3. Osobni mod filtrira vlastite projekte po `business_profile_id IS NULL` → migrirani projekt nestaje iz te liste (OK)
4. ALI: korisnik je automatski dodan u `project_members` putem triggera `add_project_owner_as_member` → projekt se pojavljuje kao "dijeljeni" projekt jer ta druga query nema filter po `business_profile_id`
5. Rezultat: projekt se pojavljuje kao "shared" projekt u osobnom modu = duplikat

### Bug 2: Projekt u poslovnom modu prikazuje samo budžet

**Uzrok**: Migracija se pokreće dok je korisnik u **osobnom modu** (`activeBusinessProfileId` je null). Nakon poziva `migrateToBusinessMode`, `fetchProjects()` se pozove, ali i dalje koristi `activeBusinessProfileId = null` iz konteksta. Projekt sada ima `business_profile_id` i ne prolazi kroz osobni filter, pa se ne učitava potpuno. Kad korisnik prebaci na poslovni mod, podaci su krnji jer se nisu pravilno refreshali.

### Popravak

#### 1. `useProjects.ts` — filtrirati dijeljene projekte po business kontekstu
U dijelu koji dohvaća shared projekte (linija 64-76), dodati isti `business_profile_id` filter:

```typescript
// Kad dohvaćamo shared projekte, filtrirati po istom business kontekstu
let sharedQuery = supabase.from('projects').select('*').in('id', memberProjectIds);

if (activeBusinessProfileId) {
  sharedQuery = sharedQuery.eq('business_profile_id', activeBusinessProfileId);
} else {
  sharedQuery = sharedQuery.is('business_profile_id', null);
}
```

#### 2. `useProjects.ts` — migracija treba ukloniti projekt iz lokalnog stanja
Nakon uspješne migracije, umjesto `fetchProjects()` (koji koristi stari kontekst), direktno ukloniti projekt iz stanja:

```typescript
// Umjesto fetchProjects(), ručno ukloniti iz trenutnog prikaza
setProjects(prev => prev.filter(p => p.id !== projectId));
```

Korisnik će vidjeti projekt kad prebaci na poslovni mod.

### Datoteke za izmjenu
- `src/hooks/useProjects.ts` — 2 promjene (filter shared projekata + migracija stanja)

