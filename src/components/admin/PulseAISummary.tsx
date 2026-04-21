import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

interface SummaryRow {
  id: string;
  summary_date: string;
  language: string;
  summary_text: string;
  created_at: string;
}

export const PulseAISummary = () => {
  const { t, i18n } = useTranslation();
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('health_summaries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    setSummaries((data as SummaryRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const language = ['hr', 'en', 'de'].includes(i18n.language) ? i18n.language : 'hr';
      const { error } = await supabase.functions.invoke('generate-health-summary', {
        body: { language },
      });
      if (error) throw error;
      showSuccess(t('admin.pulse.summaryDone', 'Sažetak izrađen'));
      await load();
    } catch (e: any) {
      showError(e.message || 'Greška');
    }
    setGenerating(false);
  };

  return (
    <div className="bg-card border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('admin.pulse.aiTitle', 'AI dnevni sažetak')}</span>
        </div>
        <Button size="sm" onClick={generate} disabled={generating} className="h-7 text-xs">
          {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          {t('admin.pulse.generateSummary', 'Generiraj')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : summaries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          {t('admin.pulse.aiEmpty', 'Još nema AI sažetaka. Klikni "Generiraj" za prvi izvještaj.')}
        </p>
      ) : (
        <div className="space-y-2">
          {summaries.map((s) => (
            <div key={s.id} className="border rounded-lg p-2.5 bg-background/50 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {format(new Date(s.created_at), 'dd.MM.yyyy HH:mm')}
                </span>
                <span className="uppercase">{s.language}</span>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {s.summary_text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
