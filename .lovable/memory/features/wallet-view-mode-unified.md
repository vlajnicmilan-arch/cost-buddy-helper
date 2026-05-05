---
name: Wallet View Mode Unified
description: Single dashboard with Personal/Company chips as pure contextual filter; no separate BusinessModeView
type: feature
---

WalletViewModeChips na PersonalModeView dashboardu su jedini context-switch. Mod je deriviran isključivo iz `activeBusinessProfileId` (null → personal, inače `business:<id>`). `setMode` postavlja samo `activeBusinessProfileId` — NE dira `businessModeEnabled` (to je global setting iz Settings za vidljivost projekata/business sekcija).

KRITIČNO: NEMA odvojenog BusinessModeView ekrana. Index.tsx uvijek renderira PersonalModeView. Klik na chip tvrtke samo prefiltrira `expenses`/`customPaymentSources` preko postojeće logike u useExpenseFetch (`applyViewMode`) i useCustomPaymentSources (filter po `activeBusinessProfileId`). Saldo, novčanici, prihodi/rashodi, transakcije — sve automatski reagira.

Legacy 'all' u localStorage → 'personal'. BusinessProfileSwitcher u headeru je zabranjen.
