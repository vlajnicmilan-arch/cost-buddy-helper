import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { friendlyError } from '@/lib/errorMessages';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Loader2, Mail, Paperclip } from 'lucide-react';
import { format } from 'date-fns';
import { uploadInvoicePdfAndSign } from '@/lib/invoicePdfUpload';
import type { ProjectInvoice } from '@/hooks/useProjectInvoices';

interface Props {
  invoice: (ProjectInvoice & { remaining?: number }) | null;
  onOpenChange: (open: boolean) => void;
}

export const SendInvoiceReminderDialog = ({ invoice, onOpenChange }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setEmail(invoice.client_email || '');
    setMessage(t('invoices.reminder.defaultMessage', 'Ljubazno Vas molimo da podmirite preostali iznos računa.'));
    setAttachPdf(true);
  }, [invoice, t]);

  if (!invoice) return null;

  const remaining = invoice.remaining ?? Number(invoice.total_amount);
  const daysOverdue = invoice.due_date
    ? Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000)
    : 0;

  const handleSend = async () => {
    if (!email.trim() || !email.includes('@')) {
      showError(t('invoices.reminder.invalidEmail', 'Unesite valjanu email adresu klijenta.'));
      return;
    }
    setSending(true);
    try {
      let pdfUrl: string | undefined;
      if (attachPdf) {
        try {
          const uploaded = await uploadInvoicePdfAndSign(invoice, invoice.remaining !== undefined
            ? (Number(invoice.total_amount) || 0) - (invoice.remaining || 0)
            : 0);
          pdfUrl = uploaded?.url;
        } catch (e) {
          console.warn('PDF attach failed, sending without it', e);
        }
      }

      const idempotencyKey = `invoice-reminder-${invoice.id}-manual-${Date.now()}`;
      const { error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'invoice-payment-reminder',
          recipientEmail: email.trim(),
          idempotencyKey,
          templateData: {
            clientName: invoice.client_name,
            invoiceNumber: invoice.invoice_number,
            issueDate: format(new Date(invoice.issue_date), 'dd.MM.yyyy'),
            dueDate: invoice.due_date ? format(new Date(invoice.due_date), 'dd.MM.yyyy') : '',
            amount: formatAmount(remaining),
            daysOverdue: daysOverdue > 0 ? String(daysOverdue) : '',
            customMessage: message.trim(),
            pdfUrl: pdfUrl || '',
          },
        },
      });
      if (error) throw error;

      // Log to invoice_reminders (best-effort)
      await (supabase.from('invoice_reminders') as any).insert({
        invoice_id: invoice.id,
        stage: 0,
        trigger: 'manual',
        recipient_email: email.trim(),
        message_id: idempotencyKey,
      });

      // Persist client_email back to invoice for future auto-reminders
      if (email.trim() !== (invoice.client_email || '')) {
        await (supabase.from('project_invoices') as any)
          .update({ client_email: email.trim() })
          .eq('id', invoice.id);
      }

      showSuccess(t('invoices.reminder.sent', 'Podsjetnik poslan'));
      onOpenChange(false);
    } catch (err: any) {
      showError(friendlyError(err, 'errors.generic'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            {t('invoices.reminder.title', 'Podsjetnik za naplatu')}
          </DialogTitle>
          <DialogDescription>
            {invoice.invoice_number} · {invoice.client_name} · {formatAmount(remaining)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="reminder-email">{t('invoices.reminder.clientEmail', 'Email klijenta')}</Label>
            <Input
              id="reminder-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="klijent@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="reminder-msg">{t('invoices.reminder.message', 'Poruka')}</Label>
            <Textarea
              id="reminder-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={attachPdf} onCheckedChange={(v) => setAttachPdf(!!v)} />
            <span className="text-sm flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              {t('invoices.reminder.attachPdf', 'Priloži PDF računa (link valjan 7 dana)')}
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground">
            {t('invoices.reminder.disclaimer', 'Šaljemo neformalni podsjetnik s vašom porukom i osnovnim podacima računa. Nije službena opomena.')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
            {t('invoices.reminder.sendBtn', 'Pošalji')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
