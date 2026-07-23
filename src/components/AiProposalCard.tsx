import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { AiProposal } from '@/lib/aiProposal';

interface Props {
  proposal: AiProposal;
}

type Status = 'idle' | 'loading' | 'confirmed' | 'rejected' | 'error';

export const AiProposalCard = ({ proposal }: Props) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const decide = async (decision: 'confirm' | 'reject') => {
    setStatus('loading');
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('confirm-ai-action', {
        body: { proposal_id: proposal.proposal_id, decision },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus(decision === 'confirm' ? 'confirmed' : 'rejected');
    } catch (e) {
      console.error('confirm-ai-action error:', e);
      setErrorMsg(e instanceof Error ? e.message : 'error');
      setStatus('error');
    }
  };

  const isDone = status === 'confirmed' || status === 'rejected';

  return (
    <div
      className={cn(
        'mt-2 rounded-xl border p-3 text-sm bg-background/60',
        status === 'confirmed' && 'border-primary/40 bg-primary/5',
        status === 'rejected' && 'border-muted-foreground/30 opacity-70',
        status === 'error' && 'border-destructive/40'
      )}
    >
      <div className="font-medium mb-2">{proposal.summary}</div>

      {proposal.old_value && proposal.new_value ? (
        <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
          <div>{t('aiProposal.before', 'Prije')}: <code>{JSON.stringify(proposal.old_value)}</code></div>
          <div>{t('aiProposal.after', 'Nakon')}: <code>{JSON.stringify(proposal.new_value)}</code></div>
        </div>
      ) : null}

      {status === 'confirmed' && (
        <div className="text-primary text-xs">✓ {t('aiProposal.confirmed', 'Potvrđeno i spremljeno.')}</div>
      )}
      {status === 'rejected' && (
        <div className="text-muted-foreground text-xs">✕ {t('aiProposal.rejected', 'Odbijeno.')}</div>
      )}
      {status === 'error' && (
        <div className="text-destructive text-xs">{t('aiProposal.error', 'Greška')}: {errorMsg}</div>
      )}

      {!isDone && (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            className="h-8 gap-1"
            disabled={status === 'loading'}
            onClick={() => decide('confirm')}
          >
            {status === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {t('aiProposal.confirm', 'Potvrdi')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={status === 'loading'}
            onClick={() => decide('reject')}
          >
            <X className="w-3 h-3" />
            {t('aiProposal.reject', 'Odbij')}
          </Button>
        </div>
      )}
    </div>
  );
};
