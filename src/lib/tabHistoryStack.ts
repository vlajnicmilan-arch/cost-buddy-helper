/**
 * tabHistoryStack — čista, testabilna logika za "back po tabovima".
 *
 * Semantika:
 *  - Svaki prijelaz na drugi tab gura PRETHODNI tab na stack.
 *  - popTab vraća zadnji jedinstven tab s vrha stacka; ako je prazan,
 *    fallback na defaultTab.
 *  - canPopTab je istinit dok trenutni tab nije defaultTab.
 *
 * Koristi se u useBackNavigationTab (react wrapper) i pokriveno je vitest-om.
 */

export interface TabHistory {
  stack: string[];
  current: string;
  defaultTab: string;
}

export function createTabHistory(defaultTab: string, current: string = defaultTab): TabHistory {
  return { stack: [], current, defaultTab };
}

export function pushTab(h: TabHistory, next: string): TabHistory {
  if (next === h.current) return h;
  return { ...h, stack: [...h.stack, h.current], current: next };
}

export function popTab(h: TabHistory): { history: TabHistory; target: string } {
  const stack = [...h.stack];
  let target: string | undefined;
  // Preskoči zastarjele/duplicirane entryje jednake trenutnom tabu.
  while (stack.length > 0) {
    const t = stack.pop()!;
    if (t !== h.current) { target = t; break; }
  }
  if (target === undefined) target = h.defaultTab;
  return { history: { ...h, stack, current: target }, target };
}

export function canPopTab(h: TabHistory): boolean {
  return h.current !== h.defaultTab;
}

export function resetTabHistory(h: TabHistory, current?: string): TabHistory {
  return { ...h, stack: [], current: current ?? h.defaultTab };
}
