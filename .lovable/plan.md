

## Plan: Add spacing between Cashflow and Recent Transactions cards

The Cashflow Forecast card (line 830-847) sits directly above the main content grid (line 851) with no margin/gap between them, making them appear visually merged.

### Change

In `src/pages/Index.tsx`, add a bottom margin to the Cashflow `Collapsible` wrapper or a top margin to the grid. Simplest approach: add `mb-4` or `mb-6` class to the Cashflow Collapsible (line 830).

**File:** `src/pages/Index.tsx`
- Line 830: Change `<Collapsible className="group">` to `<Collapsible className="group mb-4">`

This adds consistent spacing (1rem) between the two cards without affecting the rest of the layout.

