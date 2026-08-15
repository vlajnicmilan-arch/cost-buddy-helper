/**
 * BRIEF-VRATA V1 — deterministicki briefing prije ulaska u Centar.
 *
 * Nema loading ceremonije, nema automatskog prijelaza, nema tehnickih isprika.
 * Svaka greska ili istek roka => ravno u /home (fail-open prema unutra).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppState } from '@/contexts/AppStateContext';
import { useBriefSnapshot } from '@/hooks/useBriefSnapshot';
import { greetingSlot, localDayKey, markShown, readLastShown } from '@/lib/briefGate';
import { buildBriefMessages, continuityFromSnapshot, mergeContinuity } from '@/lib/brief/engine';
import { readContinuity, writeContinuity } from '@/lib/brief/continuity';
import type { BriefFilterTarget, BriefMessage } from '@/lib/brief/types';
import { requestOpenOverdueInvoices } from '@/lib/eracun/openOverdueRequest';

const isFirstDailyEntry = (lastShownIso: string | null, now: Date): boolean => {
  if (!lastShownIso) return true;
  const last = new Date(lastShownIso);
  if (Number.isNaN(last.getTime())) return true;
  return localDayKey(last) !== localDayKey(now);
};

const BriefGate = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { displayName } = useAppState();
  const { snapshot, timedOut } = useBriefSnapshot(true);

  const continuityRef = useRef(readContinuity());
  const firstDailyRef = useRef(isFirstDailyEntry(readLastShown(), new Date()));
  const marked = useRef(false);
  const touchX = useRef<number | null>(null);
  const [index, setIndex] = useState(0);

  // Jednom prikazana snimka se ZAMRZAVA za tu sesiju vrata: zakasnjeli RPC
  // smije osvjeziti predmemoriju, ali ne i tekst pod korisnikovim prstom.
  const frozen = useRef<BriefSnapshot | null>(null);
  const shown = frozen.current ?? snapshot;

  // Prefetch Home chunka — ulaz iza vrata mora biti trenutan.
  useEffect(() => {
    void import('./Index');
  }, []);

  const messages = useMemo<BriefMessage[]>(
    () => (shown?.enabled ? buildBriefMessages({ snapshot: shown, continuity: continuityRef.current }) : []),
    [shown],
  );

  // Zapis se azurira TEK kad su vrata stvarno prikazana.
  useEffect(() => {
    if (messages.length > 0 && !marked.current) {
      marked.current = true;
      frozen.current = shown;
      const now = new Date();
      markShown(now);
      writeContinuity(mergeContinuity(continuityRef.current, continuityFromSnapshot(shown, now)));
    }
  }, [messages, shown]);

  if (!shown && timedOut) return <Navigate to="/home" replace />;
  if (!shown) return null;
  if (!shown.enabled || messages.length === 0) return <Navigate to="/home" replace />;

  const enter = () => navigate('/home', { replace: true });

  const openTarget = (target: BriefFilterTarget | null) => {
    if (!target) return enter();
    if (target.path === '/home') {
      navigate('/home', { replace: true });
      if (target.view === 'overdue') requestOpenOverdueInvoices();
      return;
    }
    const params = Object.entries(target)
      .filter(([k]) => k !== 'path')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    navigate(params ? `${target.path}?${params}` : target.path, { replace: true });
  };

  const formatWhen = (dueDate: string | null | undefined): string => {
    if (!dueDate) return '';
    const d = new Date(dueDate);
    if (Number.isNaN(d.getTime())) return '';
    const today = localDayKey(new Date());
    const tomorrow = localDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const key = localDayKey(d);
    if (key === today) return t('briefGate.due.today', 'danas');
    if (key === tomorrow) return t('briefGate.due.tomorrow', 'sutra');
    return d.toLocaleDateString();
  };

  const current = messages[Math.min(index, messages.length - 1)];
  const name = (displayName || '').trim();
  const greeting = firstDailyRef.current
    ? name
      ? t(`briefGate.greeting.${greetingSlot(new Date())}Named`, { name })
      : t(`briefGate.greeting.${greetingSlot(new Date())}`)
    : null;

  const go = (delta: number) => {
    setIndex((i) => Math.min(messages.length - 1, Math.max(0, i + delta)));
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col justify-center px-5 py-10"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(delta) < 48) return;
        go(delta < 0 ? 1 : -1);
      }}
      data-testid="brief-gate"
    >
      <div className="w-full max-w-md mx-auto space-y-8">
        {greeting && <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>}

        <p className="text-xl font-medium text-foreground" data-testid="brief-gate-message">
          {t(current.textKey, {
            count: current.textParams.count,
            issuer: current.textParams.issuer,
            when: formatWhen(current.textParams.dueDate),
          })}
        </p>

        {messages.length > 1 && (
          <div className="flex items-center gap-2" role="tablist" aria-label={t('briefGate.dots', 'Poruke')}>
            {messages.map((m, i) => (
              <button
                key={`${m.category}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'}`}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          {current.target && (
            <Button
              className="w-full h-14 text-base"
              onClick={() => openTarget(current.target)}
              data-testid="brief-gate-action"
            >
              {t(current.actionKey)}
            </Button>
          )}
          <Button
            variant={current.target ? 'outline' : 'default'}
            className="w-full h-14 text-base gap-2"
            onClick={enter}
            data-testid="brief-gate-enter"
          >
            {t('briefGate.enter', 'Uđi u Centar')}
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BriefGate;
