/**
 * BRIEF-VRATA V1 — deterministicki briefing prije ulaska u Centar.
 *
 * Izgled: prazan ekran, jedan uski lijevo poravnat blok u optickom centru.
 * Nema kartica, kontejnera, ikona ni gumba — nose tipografija i prazan prostor.
 * Koreografija animira ISKLJUCIVO prozirnost; geometrija je rezervirana od
 * prvog framea (nula pomicanja).
 *
 * Svaka greska ili istek roka => ravno u /home (fail-open prema unutra).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppState } from '@/contexts/AppStateContext';
import { useBriefSnapshot } from '@/hooks/useBriefSnapshot';
import { greetingSlot, localDayKey, markShown, readLastShown } from '@/lib/briefGate';
import { buildBriefMessages, continuityFromSnapshot, mergeContinuity } from '@/lib/brief/engine';
import { readContinuity, writeContinuity } from '@/lib/brief/continuity';
import { describeDueWhen } from '@/lib/brief/dueWhen';
import { BRIEF_FADE_MS, planChoreography } from '@/lib/brief/choreography';
import type { BriefFilterTarget, BriefMessage, BriefSnapshot } from '@/lib/brief/types';
import { requestOpenOverdueInvoices } from '@/lib/eracun/openOverdueRequest';

const isFirstDailyEntry = (lastShownIso: string | null, now: Date): boolean => {
  if (!lastShownIso) return true;
  const last = new Date(lastShownIso);
  if (Number.isNaN(last.getTime())) return true;
  return localDayKey(last) !== localDayKey(now);
};

const prefersReducedMotion = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const BriefGate = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { displayName } = useAppState();
  const { snapshot, timedOut } = useBriefSnapshot(true);

  const continuityRef = useRef(readContinuity());
  const firstDailyRef = useRef(isFirstDailyEntry(readLastShown(), new Date()));
  const reducedMotionRef = useRef(prefersReducedMotion());
  const marked = useRef(false);
  const [revealed, setRevealed] = useState(0);
  const [complete, setComplete] = useState(false);

  // Jednom prikazana snimka se ZAMRZAVA za tu sesiju vrata.
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

  const formatWhen = (dueDate: string | null | undefined): string => {
    const when = describeDueWhen(dueDate, new Date());
    if (!when) return '';
    if (when.kind === 'today') return t('briefGate.due.today', 'danas');
    if (when.kind === 'tomorrow') return t('briefGate.due.tomorrow', 'sutra');
    if (when.kind === 'weekday') return t(`briefGate.due.weekday.${when.weekday}`);
    return new Date(when.day).toLocaleDateString();
  };

  const name = (displayName || '').trim();
  const greeting = name
    ? t(`briefGate.greeting.${greetingSlot(new Date())}Named`, { name })
    : t(`briefGate.greeting.${greetingSlot(new Date())}`);

  // Razrijeseni tekstovi (i18n) — pauza se racuna nad njima, ne nad kljucem.
  const lineTexts = messages.map((m) =>
    String(
      t(m.textKey, {
        count: m.textParams.count,
        issuer: m.textParams.issuer,
        when: formatWhen(m.textParams.dueDate),
      }),
    ),
  );

  const calm = messages.length === 1 && messages[0]?.category === 'calm';
  const lineTextsKey = lineTexts.join('\u0000');
  const plan = useMemo(
    () =>
      planChoreography({
        firstDaily: firstDailyRef.current,
        reducedMotion: reducedMotionRef.current,
        calm,
        greetingText: greeting,
        lineTexts: lineTextsKey ? lineTextsKey.split('\u0000') : [],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calm, greeting, lineTextsKey],
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

  // Koreografija: samo prozirnost, redom.
  useEffect(() => {
    if (messages.length === 0) return;
    if (!plan.animated) {
      setComplete(true);
      return;
    }
    const timers = [
      ...plan.lineDelays.map((d, i) => window.setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), d)),
      window.setTimeout(() => setComplete(true), plan.actionsDelay),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [plan, messages.length]);

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


  const primary = messages.find((m) => m.target);
  const isVisible = (step: number) => complete || revealed >= step;

  // Dodir bilo gdje tijekom koreografije: dovrsi prikaz, NE aktiviraj akciju.
  const finishOnInteraction = (e: React.PointerEvent) => {
    if (complete) return;
    e.preventDefault();
    e.stopPropagation();
    setRevealed(messages.length);
    setComplete(true);
  };

  const fade = (visible: boolean) =>
    `transition-opacity ease-out ${visible ? 'opacity-100' : 'opacity-0'}`;

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center px-7"
      onPointerDownCapture={finishOnInteraction}
      data-testid="brief-gate"
      data-complete={complete ? 'true' : 'false'}
    >
      <div
        className="w-full max-w-[22rem] text-left -translate-y-[6vh]"
        style={{ transitionDuration: `${BRIEF_FADE_MS}ms` }}
      >
        <p
          className={`text-lg text-muted-foreground ${fade(true)}`}
          style={{ transitionDuration: `${BRIEF_FADE_MS}ms` }}
          data-testid="brief-gate-greeting"
        >
          {greeting}
        </p>

        <div className="mt-3 space-y-2">
          {messages.map((m, i) => (
            <p
              key={`${m.category}-${i}`}
              className={`text-xl font-medium leading-snug text-foreground ${fade(isVisible(i + 1))}`}
              style={{ transitionDuration: `${BRIEF_FADE_MS}ms` }}
              data-testid={i === 0 ? 'brief-gate-message' : 'brief-gate-line'}
              data-visible={isVisible(i + 1) ? 'true' : 'false'}
            >
              {t(m.textKey, {
                count: m.textParams.count,
                issuer: m.textParams.issuer,
                when: formatWhen(m.textParams.dueDate),
              })}
            </p>
          ))}
        </div>

        <div
          className={`mt-10 flex flex-col items-start gap-1 ${fade(complete)}`}
          style={{ transitionDuration: `${BRIEF_FADE_MS}ms` }}
          data-testid="brief-gate-actions"
          aria-hidden={complete ? undefined : true}
        >
          {primary && (
            <button
              type="button"
              onClick={() => openTarget(primary.target)}
              disabled={!complete}
              className="min-h-[44px] py-2 text-base font-medium text-primary disabled:pointer-events-none"
              data-testid="brief-gate-action"
            >
              {t(primary.actionKey)} <span aria-hidden="true">→</span>
            </button>
          )}
          <button
            type="button"
            onClick={enter}
            disabled={!complete}
            className="min-h-[44px] py-2 text-base text-muted-foreground disabled:pointer-events-none"
            data-testid="brief-gate-enter"
          >
            {t('briefGate.enter', 'Uđi u Centar')} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BriefGate;
