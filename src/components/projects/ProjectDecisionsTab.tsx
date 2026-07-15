import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock,
  MessageSquare, Send, ArrowLeft, Plus, ScrollText, Archive, FileSignature,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useProjectDecisions, type ProjectDecision, type DecisionAttachment } from '@/hooks/useProjectDecisions';
import { useDecisionScan } from '@/contexts/DecisionScanContext';
import { NewDecisionDialog } from './NewDecisionDialog';
import { DecisionAttachmentPicker } from './DecisionAttachmentPicker';
import { DecisionStepAttachments } from './DecisionStepAttachments';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import {
  getLegalActions,
  decisionPhaseKey,
  resolveEffectiveDecisionPrice,
  type DecisionAction,
  type DecisionStep,
} from '@/lib/projectDecisionStateMachine';
import { parseMoneySigned } from '@/lib/money';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  projectOwnerId: string;
  /** UUID investitora projekta (može biti null). */
  investorUserId: string | null;
  /** Da li je trenutni korisnik vlasnik ili investitor (drugi ne bi trebali vidjeti tab uopće). */
  isDecisionParty: boolean;
  /** Map user_id → display_name (za timeline). */
  memberNameMap: Map<string, string>;
}

const dtFmt = (iso: string | undefined) => iso
  ? format(new Date(iso), 'd. MMM yyyy · HH:mm', { locale: hr })
  : '';

export function ProjectDecisionsTab({
  projectId, projectOwnerId, investorUserId, isDecisionParty, memberNameMap,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { decisions, loading, createDecision, addStep, getAttachmentUrl } = useProjectDecisions(projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (!isDecisionParty) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('projects.decisions.noAccess', 'Nemate pristup odlukama ovog projekta.')}
      </div>
    );
  }

  const active = useMemo(() => decisions.filter(d => d.current_status === 'awaiting_response'), [decisions]);
  const closed = useMemo(() => decisions.filter(d => d.current_status !== 'awaiting_response'), [decisions]);

  const selectedDecision = decisions.find(d => d.id === selected) ?? null;

  const handleCreate = async (input: { title: string; initial_description: string; price?: number | null; attachments?: File[] }) => {
    const res = await createDecision(input);
    if (res.ok) showSuccess(t('projects.decisions.created', 'Prijedlog poslan'));
    return res;
  };

  if (selectedDecision) {
    return (
      <DecisionDetail
        decision={selectedDecision}
        currentUserId={user?.id ?? ''}
        ownerUserId={projectOwnerId}
        investorUserId={investorUserId}
        memberNameMap={memberNameMap}
        getAttachmentUrl={getAttachmentUrl}
        onBack={() => setSelected(null)}
        onAction={async (action, message, price, attachments) => {
          const res = await addStep({ decisionId: selectedDecision.id, action, message, price, attachments });
          if (res.ok) showSuccess(t('projects.decisions.actionRecorded', 'Zabilježeno'));
          return res;
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-module-muted">{t('projects.decisions.title', 'Odluke')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('projects.decisions.subtitle', 'Prijedlozi i odobrenja između vlasnika i investitora')}
          </p>
        </div>
        <NewDecisionButton onSubmit={handleCreate} />
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground p-4">{t('common.loading', 'Učitavanje...')}</div>
      )}

      {!loading && active.length === 0 && closed.length === 0 && (
        <div className="p-8 text-center border rounded-lg bg-muted/20">
          <ScrollText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {t('projects.decisions.empty', 'Još nema odluka. Pošalji prvi prijedlog.')}
          </p>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-module-muted">
            {t('projects.decisions.active', 'Aktivne')}
          </h4>
          {active.map((d) => (
            <DecisionCard
              key={d.id} decision={d}
              currentUserId={user?.id ?? ''}
              ownerUserId={projectOwnerId}
              investorUserId={investorUserId}
              onOpen={() => setSelected(d.id)}
            />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen} className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-3 text-left">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {t('projects.decisions.archive', 'Arhiv')} ({closed.length})
                </span>
              </div>
              {archiveOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-2 py-2 space-y-2">
            {closed.map((d) => (
              <DecisionCard
                key={d.id} decision={d} compact
                currentUserId={user?.id ?? ''}
                ownerUserId={projectOwnerId}
                investorUserId={investorUserId}
                onOpen={() => setSelected(d.id)}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Kartica odluke
// ─────────────────────────────────────────────────────────────
function DecisionCard({
  decision, currentUserId, ownerUserId, investorUserId, onOpen, compact,
}: {
  decision: ProjectDecision;
  currentUserId: string;
  ownerUserId: string;
  investorUserId: string | null;
  onOpen: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const legal = getLegalActions(decision, decision.steps, { currentUserId, ownerUserId, investorUserId });
  const phase = decisionPhaseKey(decision, decision.steps);

  const badge = (() => {
    if (phase === 'approved') return { label: t('projects.decisions.status.approved', 'Odobreno'), cls: 'bg-income/15 text-income border-income/30', icon: CheckCircle2 };
    if (phase === 'rejected') return { label: t('projects.decisions.status.rejected', 'Odbijeno'), cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: XCircle };
    if (phase === 'closed') return { label: t('projects.decisions.status.closed', 'Zatvoreno bez dogovora'), cls: 'bg-muted text-muted-foreground border-border', icon: XCircle };
    if (phase === 'final_round') return { label: t('projects.decisions.status.finalRound', 'Konačna — prihvati ili odbij'), cls: 'bg-warning/15 text-warning border-warning/30', icon: Clock };
    if (phase === 'has_one_correction') return { label: t('projects.decisions.status.hasOneCorrection', 'Imaš još 1 korekciju'), cls: 'bg-warning/15 text-warning border-warning/30', icon: MessageSquare };
    return { label: t('projects.decisions.status.awaiting', 'Čeka odgovor'), cls: 'bg-module/15 text-module border-module/30', icon: Clock };
  })();
  const Icon = badge.icon;

  const yourTurn = legal.canAccept || legal.canReject || legal.canCounter || legal.canCorrect;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left p-3 rounded-lg border bg-card transition hover:bg-muted/40 active:scale-[0.99]',
        yourTurn && 'ring-1 ring-module/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium truncate">{decision.title}</span>
            {yourTurn && (
              <Badge variant="outline" className="bg-module/10 text-module border-module/30 text-[10px]">
                {t('projects.decisions.yourTurn', 'Na tebi')}
              </Badge>
            )}
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground line-clamp-2">{decision.initial_description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
            <span>{dtFmt(decision.created_at)}</span>
            <span>·</span>
            <span>{t('projects.decisions.stepCount', '{{n}} koraka', { n: decision.steps.length })}</span>
          </div>
        </div>
        <Badge variant="outline" className={cn('shrink-0 gap-1', badge.cls)}>
          <Icon className="w-3 h-3" />
          <span className="text-[10px]">{badge.label}</span>
        </Badge>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Detalj odluke
// ─────────────────────────────────────────────────────────────
function DecisionDetail({
  decision, currentUserId, ownerUserId, investorUserId, memberNameMap, onBack, onAction, getAttachmentUrl,
}: {
  decision: ProjectDecision;
  currentUserId: string;
  ownerUserId: string;
  investorUserId: string | null;
  memberNameMap: Map<string, string>;
  getAttachmentUrl: (att: DecisionAttachment) => Promise<string | null>;
  onBack: () => void;
  onAction: (
    action: DecisionAction,
    message?: string,
    price?: number | null,
    attachments?: File[],
  ) => Promise<{ ok: boolean }>;
}) {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { getDraft, saveTextDraft, saveAttachments, clearDraft } = useDecisionScan();
  const draftKey = `reply-${decision.id}`;
  const initialDraft = getDraft(draftKey);
  const [replyMsg, setReplyMsg] = useState(initialDraft.text.message ?? '');
  const [replyPriceRaw, setReplyPriceRaw] = useState(initialDraft.text.replyPriceRaw ?? '');
  const [replyAttachments, setReplyAttachments] = useState<File[]>(initialDraft.attachments ?? []);
  const [sending, setSending] = useState<DecisionAction | null>(null);

  // Perzistiraj draft odgovora (preživljava remount uzrokovan kamera roundtripom).
  useEffect(() => { saveTextDraft(draftKey, { message: replyMsg, replyPriceRaw }); }, [replyMsg, replyPriceRaw, saveTextDraft, draftKey]);
  useEffect(() => { saveAttachments(draftKey, replyAttachments); }, [replyAttachments, saveAttachments, draftKey]);

  const legal = getLegalActions(decision, decision.steps, { currentUserId, ownerUserId, investorUserId });
  const phase = decisionPhaseKey(decision, decision.steps);
  const effectivePrice = resolveEffectiveDecisionPrice(decision.steps);

  const parseOptionalPrice = (): { ok: boolean; value: number | null } => {
    if (replyPriceRaw.trim() === '') return { ok: true, value: null };
    const parsed = parseMoneySigned(replyPriceRaw);
    if (!parsed.valid) {
      showError(t('projects.decisions.priceInvalid', 'Neispravan iznos cijene'));
      return { ok: false, value: null };
    }
    if (parsed.value === 0) {
      showError(t('projects.decisions.priceNonZero', 'Cijena ne smije biti nula — ostavi prazno ili unesi iznos'));
      return { ok: false, value: null };
    }
    return { ok: true, value: parsed.value };
  };

  const doAction = async (action: DecisionAction) => {
    if ((action === 'counter' || action === 'correction') && !replyMsg.trim()) {
      showError(t('projects.decisions.messageRequired', 'Poruka je obavezna kod protuprijedloga i korekcije'));
      return;
    }
    let price: number | null = null;
    if (action === 'counter' || action === 'correction') {
      const p = parseOptionalPrice();
      if (!p.ok) return;
      price = p.value;
    }
    const carriesAttachments = action === 'propose' || action === 'counter' || action === 'correction';
    setSending(action);
    const res = await onAction(action, replyMsg, price, carriesAttachments ? replyAttachments : undefined);
    setSending(null);
    if (res.ok) {
      setReplyMsg(''); setReplyPriceRaw(''); setReplyAttachments([]);
      clearDraft(draftKey);
    }
  };

  const nameOf = (uid: string) => memberNameMap.get(uid) || (uid === ownerUserId ? t('projects.owner', 'Vlasnik') : t('projectRoles.investor', 'Investitor'));

  const actionLabel = (a: DecisionAction) => {
    switch (a) {
      case 'propose': return t('projects.decisions.action.propose', 'Prijedlog');
      case 'counter': return t('projects.decisions.action.counter', 'Protuprijedlog');
      case 'correction': return t('projects.decisions.action.correction', 'Korekcija');
      case 'accept': return t('projects.decisions.action.accept', 'Prihvaćeno');
      case 'reject': return t('projects.decisions.action.reject', 'Odbijeno');
    }
  };

  const formatSignedAmount = (amount: number) => {
    const sign = amount < 0 ? '−' : '+';
    return `${sign}${formatAmount(Math.abs(amount))}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> {t('common.back', 'Natrag')}
        </Button>
      </div>

      <div className="p-4 rounded-lg border bg-card">
        <h3 className="font-semibold text-base mb-1">{decision.title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{dtFmt(decision.created_at)} · {nameOf(decision.created_by)}</p>
        <p className="text-sm whitespace-pre-wrap">{decision.initial_description}</p>
      </div>

      {/* Ishod odluke — samo za odobrene s cijenom */}
      {decision.current_status === 'approved' && decision.contract_amendment_id && effectivePrice != null && (
        <div className="p-3 rounded-lg border border-income/30 bg-income/5 flex items-center gap-2 text-sm">
          <FileSignature className="w-4 h-4 text-income shrink-0" />
          <span>
            {t('projects.decisions.contractResult', 'Ugovoreno {{signed}} — izmjena ugovora stvorena.', {
              signed: formatSignedAmount(effectivePrice),
            })}
          </span>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-module-muted">
          {t('projects.decisions.timeline', 'Slijed koraka')}
        </h4>
        {decision.steps.map((s) => {
          const stepAttachments = decision.attachments.filter((a) => a.step_id === s.id);
          return (
            <div key={s.step_no} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepDot action={s.action} />
                <div className="flex-1 w-px bg-border mt-1" />
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{nameOf(s.actor_user_id)}</span>
                  <Badge variant="outline" className="text-[10px]">{actionLabel(s.action)}</Badge>
                  {s.price != null && s.price !== 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-semibold',
                        s.price < 0
                          ? 'bg-destructive/10 text-destructive border-destructive/30'
                          : 'bg-income/10 text-income border-income/30',
                      )}
                    >
                      {formatSignedAmount(Number(s.price))}
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">{dtFmt(s.created_at)}</span>
                </div>
                {s.message && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{s.message}</p>
                )}
                {stepAttachments.length > 0 && (
                  <DecisionStepAttachments attachments={stepAttachments} getUrl={getAttachmentUrl} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Akcije */}
      {(legal.canAccept || legal.canReject || legal.canCounter || legal.canCorrect) && (
        <div className="p-4 rounded-lg border bg-module/5 space-y-3">
          {phase === 'final_round' && (
            <div className="flex items-center gap-2 text-warning text-sm font-medium">
              <Clock className="w-4 h-4" />
              {t('projects.decisions.finalRoundBanner', 'Konačna odluka — opcija izmjene više ne postoji. Prihvati ili odbij.')}
            </div>
          )}
          {phase === 'has_one_correction' && legal.canCorrect && (
            <div className="flex items-center gap-2 text-warning text-sm font-medium">
              <MessageSquare className="w-4 h-4" />
              {t('projects.decisions.oneCorrectionBanner', 'Ovo je tvoja JEDINA i posljednja korekcija. Nakon nje druga strana bira: prihvati ili odbij.')}
            </div>
          )}

          {legal.canAccept && (
            <div className="text-sm text-muted-foreground">
              {effectivePrice != null
                ? t('projects.decisions.acceptingPrice', 'Prihvaćaš: {{signed}} — automatski se stvara izmjena ugovora.', {
                    signed: formatSignedAmount(effectivePrice),
                  })
                : t('projects.decisions.acceptingNoPrice', 'Prihvaćaš bez financijskog učinka (nema cijene).')}
            </div>
          )}

          {(legal.canCounter || legal.canCorrect) && (
            <>
              <Textarea
                value={replyMsg}
                onChange={(e) => setReplyMsg(e.target.value)}
                placeholder={t('projects.decisions.replyPlaceholder', 'Poruka za drugu stranu (obavezno kod protuprijedloga/korekcije)...') as string}
                rows={4}
              />
              <Input
                inputMode="decimal"
                value={replyPriceRaw}
                onChange={(e) => setReplyPriceRaw(e.target.value)}
                placeholder={t('projects.decisions.field.pricePlaceholderReply', 'Cijena (€) — opcionalno; negativno = smanjenje') as string}
              />
              {effectivePrice != null && (
                <p className="text-[11px] text-muted-foreground">
                  {t('projects.decisions.lastOfferedHint', 'Zadnja ponuđena: {{signed}}. Ostavi prazno da zadržiš.', {
                    signed: formatSignedAmount(effectivePrice),
                  })}
                </p>
              )}
              <DecisionAttachmentPicker
                value={replyAttachments}
                onChange={setReplyAttachments}
                disabled={!!sending}
                captureKey={draftKey}
              />
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {legal.canAccept && (
              <Button
                onClick={() => doAction('accept')}
                disabled={!!sending}
                className="bg-income hover:bg-income/90 text-white gap-1"
              >
                <CheckCircle2 className="w-4 h-4" /> {t('projects.decisions.action.accept', 'Prihvati')}
              </Button>
            )}
            {legal.canReject && (
              <Button
                onClick={() => doAction('reject')}
                disabled={!!sending}
                variant="destructive"
                className="gap-1"
              >
                <XCircle className="w-4 h-4" /> {t('projects.decisions.action.reject', 'Odbij')}
              </Button>
            )}
            {legal.canCounter && (
              <Button
                onClick={() => doAction('counter')}
                disabled={!!sending || !replyMsg.trim()}
                variant="outline"
                className="gap-1"
              >
                <Send className="w-4 h-4" /> {t('projects.decisions.action.counterBtn', 'Predloži izmjenu')}
              </Button>
            )}
            {legal.canCorrect && (
              <Button
                onClick={() => doAction('correction')}
                disabled={!!sending || !replyMsg.trim()}
                variant="outline"
                className="gap-1"
              >
                <Send className="w-4 h-4" /> {t('projects.decisions.action.correctionBtn', 'Pošalji korekciju')}
              </Button>
            )}
          </div>
        </div>
      )}

      {legal.isClosed && (
        <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
          {t('projects.decisions.closedInfo', 'Odluka je zatvorena. Otvori novi prijedlog za daljnji razgovor.')}
        </div>
      )}
    </div>
  );
}

function StepDot({ action }: { action: DecisionAction }) {
  const cls = action === 'accept'
    ? 'bg-income'
    : action === 'reject'
    ? 'bg-destructive'
    : action === 'counter' || action === 'correction'
    ? 'bg-warning'
    : 'bg-module';
  return <div className={cn('w-3 h-3 rounded-full mt-1.5', cls)} />;
}

function NewDecisionButton({ onSubmit }: { onSubmit: (i: { title: string; initial_description: string; price?: number | null }) => Promise<{ ok: boolean }> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
        <Plus className="w-4 h-4" /> {t('projects.decisions.new', 'Novi prijedlog')}
      </Button>
      <NewDecisionDialog open={open} onOpenChange={setOpen} onSubmit={onSubmit} />
    </>
  );
}
