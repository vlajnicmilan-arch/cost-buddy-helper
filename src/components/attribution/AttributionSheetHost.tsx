/**
 * AttributionSheetHost — globalni listener za CustomEvent koji otvara
 * AttributionSheet. Mountiran jednom u App overlay ladici.
 *
 * Također provjerava sessionStorage `vmb:attribution:resume` pri mountu:
 * ako je korisnik prošao kroz "Dodaj izvor u Novčaniku" put, sheet se
 * automatski ponovno otvara s izvornim payloadom.
 */
import { useEffect, useState } from 'react';
import { ATTRIBUTION_OPEN_EVENT, type AttributionOpenPayload } from '@/lib/attribution/events';
import { AttributionSheet, consumeAttributionResume } from './AttributionSheet';

export function AttributionSheetHost() {
  const [payload, setPayload] = useState<AttributionOpenPayload | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AttributionOpenPayload>).detail;
      if (!detail || !Array.isArray(detail.payoutIds) || detail.payoutIds.length === 0) return;
      setPayload(detail);
    };
    window.addEventListener(ATTRIBUTION_OPEN_EVENT, handler);
    // Resume nakon dodavanja izvora
    const resumed = consumeAttributionResume();
    if (resumed) setPayload(resumed);
    return () => window.removeEventListener(ATTRIBUTION_OPEN_EVENT, handler);
  }, []);

  return <AttributionSheet open={!!payload} payload={payload} onClose={() => setPayload(null)} />;
}
