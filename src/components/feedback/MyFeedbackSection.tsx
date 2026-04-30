import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Bug, Lightbulb, HelpCircle, Star, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { hr as hrLocale } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';

const typeIcons: Record<string, typeof Bug> = { bug: Bug, idea: Lightbulb, question: HelpCircle };
const typeLabels: Record<string, string> = { bug: 'Bug', idea: 'Ideja', question: 'Pitanje' };
const typeBadgeColors: Record<string, string> = {
  bug: 'bg-destructive/15 text-destructive',
  idea: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  question: 'bg-primary/15 text-primary',
};
const statusColors: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  triaged: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  in_progress: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  resolved: 'bg-green-500/15 text-green-700 dark:text-green-400',
  closed: 'bg-muted text-muted-foreground',
};
const statusLabelsKey = (s: string) => `feedbackForm.status_${s}`;
const statusFallback: Record<string, string> = {
  new: 'Novo', triaged: 'Triaged', in_progress: 'U tijeku', resolved: 'Riješeno', closed: 'Zatvoreno',
};

export const MyFeedbackSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('feedback_submissions')
      .select('id, type, message, status, rating, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  if (!user) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          {t('feedbackForm.mySection', 'Moji feedback-i')}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpenDialog(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t('feedbackForm.newOne', 'Nova')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
          {t('feedbackForm.empty', 'Još nema poslanih povratnih informacija.')}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const Icon = typeIcons[r.type] || MessageSquare;
            return (
              <div key={r.id} className="bg-card border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={typeBadgeColors[r.type] || 'bg-muted'} variant="secondary">
                    <Icon className="w-3 h-3 mr-1" />{typeLabels[r.type] || r.type}
                  </Badge>
                  {r.rating ? (
                    <span className="inline-flex items-center text-xs text-yellow-600 dark:text-yellow-400">
                      <Star className="w-3 h-3 fill-current mr-0.5" />{r.rating}
                    </span>
                  ) : null}
                  <Badge className={statusColors[r.status] || 'bg-muted'} variant="secondary">
                    {String(t(statusLabelsKey(r.status), statusFallback[r.status] || r.status))}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {format(new Date(r.created_at), 'dd. MMM yyyy.', { locale: hrLocale })}
                  </span>
                </div>
                <p className="text-sm line-clamp-2">{r.message}</p>
              </div>
            );
          })}
        </div>
      )}

      <FeedbackDialog open={openDialog} onOpenChange={(o) => { setOpenDialog(o); if (!o) load(); }} />
    </div>
  );
};
