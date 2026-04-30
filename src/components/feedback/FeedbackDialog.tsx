import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Bug, Lightbulb, HelpCircle, Send, Check, Loader2, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

type FeedbackType = 'bug' | 'idea' | 'question';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: FeedbackType;
}

// Lightweight in-memory ring buffer of recent console messages
type LogEntry = { level: string; message: string; t: number };
const consoleBuffer: LogEntry[] = [];
const MAX_LOGS = 25;
let consolePatched = false;

function patchConsole() {
  if (consolePatched || typeof window === 'undefined') return;
  consolePatched = true;
  (['log', 'info', 'warn', 'error'] as const).forEach((level) => {
    const orig = (console as any)[level];
    (console as any)[level] = (...args: any[]) => {
      try {
        const msg = args
          .map((a) => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch { return String(a); }
          })
          .join(' ')
          .slice(0, 500);
        consoleBuffer.push({ level, message: msg, t: Date.now() });
        if (consoleBuffer.length > MAX_LOGS) consoleBuffer.shift();
      } catch {
        /* ignore */
      }
      return orig.apply(console, args);
    };
  });
}

if (typeof window !== 'undefined') patchConsole();

export const FeedbackDialog = ({ open, onOpenChange, defaultType = 'idea' }: FeedbackDialogProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();

  const [type, setType] = useState<FeedbackType>(defaultType);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const diagnostics = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return {
      route: location.pathname + (location.search || ''),
      app_version: (import.meta as any).env?.VITE_APP_VERSION || 'web',
      language: i18n.language || 'hr',
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
      platform: (navigator as any).userAgentData?.platform || navigator.platform || 'unknown',
      user_agent: navigator.userAgent.slice(0, 500),
      console_tail: consoleBuffer.slice(-15),
    };
  }, [location.pathname, location.search, i18n.language, open]);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      if (user?.email) setEmail(user.email);
    } else {
      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        setRating(null);
        setShowDiagnostics(false);
      }, 300);
    }
  }, [open, user, defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!message.trim() || message.trim().length < 5) {
      showError(t('feedbackForm.errorMessageTooShort', 'Molimo opišite barem nakratko (min. 5 znakova)'));
      return;
    }
    if (!user && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showError(t('feedbackForm.errorInvalidEmail', 'Neispravna email adresa'));
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        user_id: user?.id ?? null,
        email: (user?.email || email.trim() || null) as string | null,
        type,
        message: message.trim(),
        rating,
        language: (i18n.language || 'hr').slice(0, 2),
      };
      if (includeDiagnostics && diagnostics) {
        payload.route = diagnostics.route;
        payload.app_version = diagnostics.app_version;
        payload.user_agent = diagnostics.user_agent;
        payload.viewport = diagnostics.viewport;
        payload.platform = diagnostics.platform;
        payload.console_tail = diagnostics.console_tail;
      }

      const { error } = await supabase.from('feedback_submissions').insert(payload);
      if (error) throw error;

      setSubmitted(true);
      showSuccess(t('feedbackForm.thanks', 'Hvala na povratnoj informaciji!'));
    } catch (err: any) {
      console.error('[feedback] submit failed', err);
      showError(t('feedbackForm.submitFailed', 'Slanje nije uspjelo. Pokušajte ponovno.'));
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions: { value: FeedbackType; icon: typeof Bug; labelKey: string; fallback: string; color: string }[] = [
    { value: 'bug', icon: Bug, labelKey: 'feedbackForm.typeBug', fallback: 'Greška', color: 'text-destructive' },
    { value: 'idea', icon: Lightbulb, labelKey: 'feedbackForm.typeIdea', fallback: 'Ideja', color: 'text-yellow-500' },
    { value: 'question', icon: HelpCircle, labelKey: 'feedbackForm.typeQuestion', fallback: 'Pitanje', color: 'text-primary' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('feedbackForm.title', 'Pošalji povratnu informaciju')}</DialogTitle>
          <DialogDescription>
            {t('feedbackForm.subtitle', 'Pomozite nam poboljšati aplikaciju. Vaš input ide direktno timu.')}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Check className="w-5 h-5" />
                {t('feedbackForm.successTitle', 'Hvala! Zaprimljeno.')}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('feedbackForm.successBody', 'Pregledat ćemo vašu povratnu informaciju što prije. Ako ste ostavili email, javit ćemo vam se po potrebi.')}
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              {t('common.close', 'Zatvori')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div className="space-y-1.5">
              <Label>{t('feedbackForm.typeLabel', 'Vrsta')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {typeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors min-h-[80px]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card hover:bg-accent text-muted-foreground'
                      )}
                    >
                      <Icon className={cn('w-5 h-5', active ? opt.color : '')} />
                      <span className="text-xs font-medium">
                        {t(opt.labelKey, opt.fallback)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor="feedback-message">
                {t('feedbackForm.message', 'Vaša poruka')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="feedback-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? t('feedbackForm.placeholderBug', 'Što ste pokušavali? Što se dogodilo? Što ste očekivali?')
                    : type === 'idea'
                    ? t('feedbackForm.placeholderIdea', 'Opišite svoju ideju ili prijedlog...')
                    : t('feedbackForm.placeholderQuestion', 'Postavite svoje pitanje...')
                }
                maxLength={5000}
              />
              <div className="text-xs text-muted-foreground/70 text-right">{message.length}/5000</div>
            </div>

            {/* Rating (optional, mainly for ideas/general) */}
            {type !== 'bug' && (
              <div className="space-y-1.5">
                <Label>{t('feedbackForm.ratingLabel', 'Ocjena aplikacije (opcionalno)')}</Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(rating === n ? null : n)}
                      aria-label={t('feedbackForm.ratingStar', '{{n}} zvjezdica', { n })}
                      className="p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star
                        className={cn(
                          'w-6 h-6 transition-colors',
                          rating !== null && n <= rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-muted-foreground/50'
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Email if anonymous */}
            {!user && (
              <div className="space-y-1.5">
                <Label htmlFor="feedback-email">
                  {t('feedbackForm.emailOptional', 'Email (opcionalno, za odgovor)')}
                </Label>
                <Input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={200}
                />
              </div>
            )}

            {/* Diagnostics toggle */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="feedback-diag" className="text-sm font-medium cursor-pointer">
                    {t('feedbackForm.attachDiagnostics', 'Priloži dijagnostiku')}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('feedbackForm.diagnosticsHelp', 'Trenutna stranica, verzija i posljednje console poruke. Pomaže timu brže riješiti problem.')}
                  </p>
                </div>
                <Switch
                  id="feedback-diag"
                  checked={includeDiagnostics}
                  onCheckedChange={setIncludeDiagnostics}
                />
              </div>

              {includeDiagnostics && (
                <button
                  type="button"
                  onClick={() => setShowDiagnostics((s) => !s)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                >
                  {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showDiagnostics
                    ? t('feedbackForm.hidePreview', 'Sakrij pregled')
                    : t('feedbackForm.showPreview', 'Prikaži što se šalje')}
                </button>
              )}

              {includeDiagnostics && showDiagnostics && diagnostics && (
                <pre className="text-[10px] leading-tight bg-background/60 rounded p-2 overflow-x-auto max-h-40 text-muted-foreground">
{JSON.stringify(diagnostics, null, 2)}
                </pre>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t('common.cancel', 'Odustani')}
              </Button>
              <Button type="submit" disabled={submitting} className="min-w-[140px]">
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('feedbackForm.sending', 'Šaljem...')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {t('feedbackForm.send', 'Pošalji')}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
