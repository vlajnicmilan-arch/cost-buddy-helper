/**
 * BRIEF-VRATA (V1) — pozdravni ekran s istinama i izborima prije ulaska.
 *
 * Nikad nema vlastiti loading state: ili je snimka tu (instantCache) ili se
 * čeka do 400 ms, a onda se ide ravno u /home. Svaki kvar = običan ulazak.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, FileText, Inbox, Bell, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppState } from '@/contexts/AppStateContext';
import { useBriefGate } from '@/hooks/useBriefGate';
import {
  greetingSlot,
  hasAnyTruth,
  markShown,
  truthsFromSnapshot,
} from '@/lib/briefGate';
import { requestOpenOverdueInvoices } from '@/lib/eracun/openOverdueRequest';

const BriefGate = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { displayName } = useAppState();
  const { snapshot, hasImportDraft, giveUp } = useBriefGate(true);
  const marked = useRef(false);

  // Prefetch Home chunka — stvarna korist vrata.
  useEffect(() => {
    void import('./Index');
  }, []);

  const truths = useMemo(
    () => truthsFromSnapshot(snapshot, hasImportDraft),
    [snapshot, hasImportDraft],
  );

  const show = !!snapshot?.enabled && hasAnyTruth(truths);

  useEffect(() => {
    if (show && !marked.current) {
      marked.current = true;
      markShown(new Date());
    }
  }, [show]);

  if (!snapshot && giveUp) return <Navigate to="/home" replace />;
  if (snapshot && !show) return <Navigate to="/home" replace />;
  if (!snapshot) return null; // bez loading ceremonije

  const name = (displayName || '').trim();
  const slot = greetingSlot(new Date());
  const greeting = name
    ? t(`briefGate.greeting.${slot}Named`, { name })
    : t(`briefGate.greeting.${slot}`);

  const enter = () => navigate('/home', { replace: true });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-5 py-10">
      <div className="w-full max-w-md mx-auto space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground">{t('briefGate.subtitle')}</p>
        </header>

        <ul className="space-y-2">
          {truths.invoiceCount > 0 && (
            <TruthRow
              icon={<FileText className="w-4 h-4 text-primary" />}
              text={t('briefGate.truths.invoices', { count: truths.invoiceCount })}
              hint={
                truths.invoiceNextDue
                  ? t('briefGate.truths.invoicesDue', {
                      date: new Date(truths.invoiceNextDue).toLocaleDateString(),
                    })
                  : undefined
              }
              actionLabel={t('briefGate.actions.invoices')}
              onAction={() => {
                navigate('/home', { replace: true });
                requestOpenOverdueInvoices();
              }}
            />
          )}
          {truths.documentCount > 0 && (
            <TruthRow
              icon={<Inbox className="w-4 h-4 text-primary" />}
              text={t('briefGate.truths.documents', { count: truths.documentCount })}
              actionLabel={t('briefGate.actions.documents')}
              onAction={() => navigate('/dokumenti', { replace: true })}
            />
          )}
          {truths.attentionCount > 0 && (
            <TruthRow
              icon={<Bell className="w-4 h-4 text-primary" />}
              text={t('briefGate.truths.attention', { count: truths.attentionCount })}
              actionLabel={t('briefGate.actions.attention')}
              onAction={enter}
            />
          )}
          {truths.hasImportDraft && (
            <TruthRow
              icon={<Upload className="w-4 h-4 text-primary" />}
              text={t('briefGate.truths.importDraft')}
              actionLabel={t('briefGate.actions.importDraft')}
              onAction={() => navigate('/import/review', { replace: true })}
            />
          )}
        </ul>

        <Button
          onClick={enter}
          className="w-full h-14 text-base gap-2"
          data-testid="brief-gate-enter"
        >
          {t('briefGate.actions.enter')}
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
};

interface TruthRowProps {
  icon: React.ReactNode;
  text: string;
  hint?: string;
  actionLabel: string;
  onAction: () => void;
}

const TruthRow = ({ icon, text, hint, actionLabel, onAction }: TruthRowProps) => (
  <li className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-xl">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{text}</p>
        {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
      </div>
    </div>
    <Button variant="outline" size="sm" className="shrink-0 min-h-[44px]" onClick={onAction}>
      {actionLabel}
    </Button>
  </li>
);

export default BriefGate;
