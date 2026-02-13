import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Send, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface TransactionNote {
  id: string;
  expense_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    display_name: string | null;
  };
}

interface TransactionNotesThreadProps {
  expenseId: string;
  incomeSourceId?: string | null;
  projectId?: string | null;
  paymentSourceId?: string | null;
  initialNote?: string | null;
  onNoteAdded?: () => void;
}

export const TransactionNotesThread = ({
  expenseId,
  incomeSourceId,
  projectId,
  paymentSourceId,
  initialNote,
  onNoteAdded
}: TransactionNotesThreadProps) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState<TransactionNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  // Fetch notes and profiles - works for both income sources and projects
  useEffect(() => {
    if (!expenseId || (!incomeSourceId && !projectId && !paymentSourceId)) return;
    
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('transaction_notes')
          .select('*')
          .eq('expense_id', expenseId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setNotes(data || []);

        // Fetch profiles for all unique user_ids
        const userIds = [...new Set((data || []).map(n => n.user_id))];
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', userIds);

          if (profilesData) {
            const profileMap: Record<string, string> = {};
            profilesData.forEach(p => {
              profileMap[p.user_id] = p.display_name || 'Član';
            });
            setProfiles(profileMap);
          }
        }
      } catch (error) {
        console.error('Error fetching notes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [expenseId, incomeSourceId, projectId, paymentSourceId]);

  const handleSendNote = async () => {
    if (!newNote.trim() || !user || (!incomeSourceId && !projectId && !paymentSourceId)) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('transaction_notes')
        .insert({
          expense_id: expenseId,
          user_id: user.id,
          content: newNote.trim()
        })
        .select()
        .single();

      if (error) throw error;

      setNotes(prev => [...prev, data]);
      setNewNote('');

      // Add current user's profile to profiles map if not there
      if (!profiles[user.id]) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .single();

        if (profileData) {
          setProfiles(prev => ({
            ...prev,
            [user.id]: profileData.display_name || 'Ti'
          }));
        }
      }

      // Notify about new comment - for income sources
      if (incomeSourceId) {
        try {
          await supabase.functions.invoke('notify-note-added', {
            body: {
              expense_id: expenseId,
              income_source_id: incomeSourceId,
              note: newNote.trim()
            }
          });
        } catch (notifyError) {
          console.error('Error sending notification:', notifyError);
        }
      }
      
      // Notify about new comment - for projects
      if (projectId) {
        try {
          await supabase.functions.invoke('notify-note-added', {
            body: {
              expense_id: expenseId,
              project_id: projectId,
              note: newNote.trim()
            }
          });
        } catch (notifyError) {
          console.error('Error sending project notification:', notifyError);
        }
      }

      // Notify about new comment - for payment sources
      if (paymentSourceId) {
        try {
          await supabase.functions.invoke('notify-note-added', {
            body: {
              expense_id: expenseId,
              payment_source_id: paymentSourceId,
              note: newNote.trim()
            }
          });
        } catch (notifyError) {
          console.error('Error sending payment source notification:', notifyError);
        }
      }

      onNoteAdded?.();
      toast.success(t('transactions.noteSent', 'Napomena poslana'));
    } catch (error) {
      console.error('Error sending note:', error);
      toast.error(t('transactions.noteError', 'Greška pri slanju napomene'));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('transaction_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast.success(t('common.deleted', 'Obrisano'));
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error(t('common.error', 'Greška'));
    }
  };

  // Don't show for transactions without income source or project
  if (!incomeSourceId && !projectId) return null;

  const allNotes = notes;
  const hasInitialNote = initialNote && initialNote.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-medium">
          {t('transactions.notes', 'Napomene')} 
          {(allNotes.length > 0 || hasInitialNote) && (
            <span className="ml-1 text-primary">
              ({allNotes.length + (hasInitialNote ? 1 : 0)})
            </span>
          )}
        </span>
      </div>

      {/* Notes thread */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {/* Show initial note from expense.note field if exists */}
        {hasInitialNote && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm whitespace-pre-wrap">{initialNote}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('transactions.initialNote', 'Originalna napomena')}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : allNotes.length === 0 && !hasInitialNote ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            {t('transactions.noNotes', 'Nema napomena. Započni razgovor!')}
          </p>
        ) : (
          allNotes.map((note) => {
            const isOwnNote = note.user_id === user?.id;
            return (
              <div
                key={note.id}
                className={cn(
                  "p-3 rounded-lg group relative",
                  isOwnNote 
                    ? "bg-primary/10 border border-primary/20 ml-4" 
                    : "bg-muted/50 mr-4"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary mb-1">
                      {isOwnNote ? t('common.you', 'Ti') : profiles[note.user_id] || t('common.member', 'Član')}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(note.created_at), 'dd.MM.yyyy. HH:mm', { locale: dateLocale })}
                    </p>
                  </div>
                  {isOwnNote && (
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New note input */}
      <div className="flex gap-2">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={t('transactions.writeNote', 'Napiši napomenu...')}
          rows={2}
          className="resize-none flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendNote();
            }
          }}
        />
        <Button
          onClick={handleSendNote}
          disabled={!newNote.trim() || sending}
          size="icon"
          className="shrink-0 h-auto"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
