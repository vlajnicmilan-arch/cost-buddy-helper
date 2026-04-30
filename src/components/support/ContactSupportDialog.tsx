import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Send, Clock, ExternalLink, Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

const SUPPORT_EMAIL = 'support@vmbalance.com';

interface ContactSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHelp?: () => void;
}

export const ContactSupportDialog = ({ open, onOpenChange, onOpenHelp }: ContactSupportDialogProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('question');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  useEffect(() => {
    if (open && user) {
      setEmail(user.email || '');
      const meta = (user.user_metadata || {}) as Record<string, any>;
      setName(meta.display_name || meta.full_name || meta.name || '');
    }
    if (!open) {
      // reset after close so next open is fresh
      setTimeout(() => {
        setSubmitted(false);
        setSubject('');
        setMessage('');
        setCategory('question');
      }, 300);
    }
  }, [open, user]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim() || !subject.trim() || !message.trim()) {
      showError(t('support.errorMissingFields', 'Molimo ispunite sva obavezna polja'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showError(t('support.errorInvalidEmail', 'Neispravna email adresa'));
      return;
    }

    setSubmitting(true);
    try {
      const ticketId = crypto.randomUUID();
      const language = (i18n.language || 'hr').slice(0, 2);
      const appVersion = (import.meta as any).env?.VITE_APP_VERSION || 'web';

      const { error: insertError } = await supabase.from('support_tickets').insert({
        id: ticketId,
        user_id: user?.id ?? null,
        email: email.trim(),
        name: name.trim() || null,
        subject: subject.trim(),
        message: message.trim(),
        category,
        language,
        app_version: appVersion,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
      });

      if (insertError) throw insertError;

      // Fire auto-responder (don't fail ticket creation if email fails)
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'support-auto-responder',
            recipientEmail: email.trim(),
            idempotencyKey: `support-autoresp-${ticketId}`,
            templateData: {
              name: name.trim() || undefined,
              subject: subject.trim(),
              message: message.trim(),
              ticketId,
              language,
            },
          },
        });
        // Mark sent (best-effort, will silently fail for anon users due to RLS — that's OK)
        await supabase
          .from('support_tickets')
          .update({ auto_responder_sent: true })
          .eq('id', ticketId);
      } catch (mailErr) {
        console.warn('[support] auto-responder failed', mailErr);
      }

      setSubmitted(true);
      showSuccess(t('support.submittedSuccess', 'Upit poslan!'));
    } catch (err: any) {
      console.error('[support] submit failed', err);
      showError(t('support.submitFailed', 'Slanje nije uspjelo. Pokušajte direktan email.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            {t('support.title', 'Kontaktirajte podršku')}
          </DialogTitle>
          <DialogDescription>
            {t('support.subtitle', 'Pitanja, prijedlozi ili problemi? Odgovaramo unutar 24 sata.')}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Check className="w-5 h-5" />
                {t('support.successTitle', 'Hvala! Vaš upit je zaprimljen.')}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('support.successBody', 'Poslali smo vam potvrdu na email. Naš tim će vam odgovoriti unutar 24 sata.')}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Clock className="w-3.5 h-3.5" />
                {t('support.responseTime', 'Prosječno vrijeme odgovora: nekoliko sati')}
              </div>
            </div>

            {onOpenHelp && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => onOpenHelp(), 200);
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('support.openFaq', 'Otvori upute i FAQ')}
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)} className="w-full">
              {t('common.close', 'Zatvori')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Direct contact info banner */}
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 border border-border/50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <span className="font-medium truncate">{SUPPORT_EMAIL}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyEmail}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1 min-h-[36px]"
                aria-label={t('support.copyEmail', 'Kopiraj email')}
              >
                {emailCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {emailCopied ? t('support.copied', 'Kopirano') : t('support.copy', 'Kopiraj')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="support-name">{t('support.name', 'Ime')}</Label>
                <Input
                  id="support-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('support.namePlaceholder', 'Vaše ime')}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="support-email">
                  {t('support.email', 'Email')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="support-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support-category">{t('support.category', 'Kategorija')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="support-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">{t('support.catQuestion', 'Pitanje')}</SelectItem>
                  <SelectItem value="bug">{t('support.catBug', 'Prijava greške')}</SelectItem>
                  <SelectItem value="feature">{t('support.catFeature', 'Prijedlog značajke')}</SelectItem>
                  <SelectItem value="billing">{t('support.catBilling', 'Naplata / pretplata')}</SelectItem>
                  <SelectItem value="account">{t('support.catAccount', 'Račun i podaci')}</SelectItem>
                  <SelectItem value="other">{t('support.catOther', 'Ostalo')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support-subject">
                {t('support.subject', 'Tema')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="support-subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('support.subjectPlaceholder', 'Kratko opišite o čemu se radi')}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support-message">
                {t('support.message', 'Poruka')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="support-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('support.messagePlaceholder', 'Opišite svoje pitanje ili problem što detaljnije...')}
                maxLength={4000}
              />
              <div className="text-xs text-muted-foreground/70 text-right">
                {message.length}/4000
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/15 rounded-md px-3 py-2">
              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{t('support.replyPromise', 'Odgovaramo unutar 24 sata. Dobit ćete email potvrdu odmah.')}</span>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
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
                    {t('support.sending', 'Šaljem...')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {t('support.send', 'Pošalji upit')}
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
