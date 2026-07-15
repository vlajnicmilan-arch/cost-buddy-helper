import { useLayoutEffect, useRef, useState } from 'react';
import { useBackButton } from '@/hooks/useBackButton';
import { BACK_PRIORITY } from '@/contexts/BackButtonContext';
import {
  createTabHistory,
  pushTab,
  popTab,
  canPopTab,
  resetTabHistory,
  type TabHistory,
} from '@/lib/tabHistoryStack';

/**
 * Registrira "back po tabovima" unutar fullscreen view-a.
 *
 *  - Prati stack posjećenih tabova u ref-u (preživljava re-render).
 *  - Registrira useBackButton s TAB prioritetom (niži od dijaloga/detalja),
 *    tako da back najprije zatvori sve overlay/dijalog/detail slojeve, pa
 *    tek onda mijenja tab.
 *  - Kad je stack prazan i tab je već default, back se ne konzumira — pada
 *    na sljedeći sloj (obično FULLSCREEN handler koji zatvara view).
 *  - onGoBack se poziva s ciljanim tabom; consumer mora ISKORISTITI normalni
 *    handleTabChange put (perzistencija / logging), a ne zaobići ga.
 */
export function useBackNavigationTab(
  activeTab: string,
  defaultTab: string,
  onGoBack: (prev: string) => void,
  enabled: boolean = true,
  label = 'TAB',
) {
  const historyRef = useRef<TabHistory>(createTabHistory(defaultTab, activeTab));
  const suppressRef = useRef(false);
  const [, forceRevision] = useState(0);

  const bumpRevision = () => forceRevision(v => v + 1);

  // Sinkroniziraj default tab ako se promijeni (npr. worker-only mode).
  useLayoutEffect(() => {
    if (historyRef.current.defaultTab !== defaultTab) {
      historyRef.current = resetTabHistory(
        { ...historyRef.current, defaultTab },
        activeTab,
      );
      bumpRevision();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTab]);

  // Bilježi prijelaze uzrokovane VANJSKIM promjenama activeTab (klik na tab).
  // Programatski pop iz našeg goBack-a preskačemo preko suppressRef-a.
  useLayoutEffect(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      if (historyRef.current.current !== activeTab) {
        historyRef.current = { ...historyRef.current, current: activeTab };
        bumpRevision();
      }
      return;
    }
    if (historyRef.current.current === activeTab) return;
    historyRef.current = pushTab(historyRef.current, activeTab);
    bumpRevision();
  }, [activeTab]);

  const canPop = enabled && canPopTab(historyRef.current);

  useBackButton(
    canPop,
    () => {
      const { history, target } = popTab(historyRef.current);
      historyRef.current = history;
      suppressRef.current = true;
      onGoBack(target);
    },
    BACK_PRIORITY.TAB,
    label,
  );
}
