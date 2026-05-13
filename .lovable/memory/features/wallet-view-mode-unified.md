---
name: Wallet View Mode Unified
description: Single source of truth za chip Osobno/tvrtka, derive iz AppState; sakriven kad je business mode off
type: feature
---

- 'all' mod uklonjen; samo Osobno + tvrtka
- `WalletViewModeContext.mode` derive iz `activeBusinessProfileId` **AND** `businessModeEnabled` (oboje moraju biti true za business view)
- `WalletViewModeChips` se ne prikazuje kad je `businessModeEnabled === false` ili nema profila
- `activeBusinessProfileId` se NE briše kad se isključi business mode — čuva se za sljedeće uključenje
- Legacy 'all' u localStorage automatski → 'personal'
- BusinessProfileSwitcher + chips sinkronizirani preko BusinessViewSync hooka
