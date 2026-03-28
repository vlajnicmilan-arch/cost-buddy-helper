

# Plan: Promjena obaveznih/opcionih tabova

Zamjena: **Pregled (overview)** postaje opcionalni tab (default skriven), a **Timeline** postaje obavezni tab (uvijek vidljiv).

## Promjene

### 1. `src/hooks/useProjectMemberPermissions.ts`

- Premjesti `timeline` iz `OPTIONAL_TABS` u `MANDATORY_TABS`
- Premjesti `overview` iz `MANDATORY_TABS` u `OPTIONAL_TABS`

```typescript
export const OPTIONAL_TABS = ['overview', 'milestones', 'workers', 'collaborators', 'funding', 'transactions'] as const;
export const MANDATORY_TABS = ['timeline', 'members'] as const;
```

### 2. Provjera `ProjectFullScreenView.tsx` i `ProjectDetailDialog.tsx`

Filtriranje se već oslanja na `isTabVisible()` iz hooka koji provjerava `MANDATORY_TABS` — tako da će automatski raditi nakon promjene konstanti. Samo treba provjeriti da default tab nije hardkodiran na `overview` za ne-managere.

