import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { Loader2, RefreshCw, Bug, Lightbulb, HelpCircle, MessageSquare, Search, Star, Monitor, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { hr as hrLocale } from 'date-fns/locale';
import { friendlyError } from '@/lib/errorMessages';

type FeedbackType = 'bug' | 'idea' | 'question' | 'all';
type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed';

interface FeedbackRow {
  id: string;
  user_id: string | null;
  email: string | null;
  type: string;
  message: string;
  rating: number | null;
  route: string | null;
  app_version: string | null;
  user_agent: string | null;
  language: string | null;
  viewport: string | null;
  platform: string | null;
  console_tail: any;
  status: string;
  created_at: string;
  updated_at: string;
  user_display_name?: string;
}

const typeIcons: Record<string, typeof Bug> = {
  bug: Bug,
  idea: Lightbulb,
  question: HelpCircle,
};

const typeLabels: Record<string, string> = {
  bug: 'Bug',
  idea: 'Ideja',
  question: 'Pitanje',
};

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

const statusLabels: Record<string, string> = {
  new: 'Novo',
  triaged: 'Triaged',
  in_progress: 'U tijeku',
  resolved: 'Riješeno',
  closed: 'Zatvoreno',
};

export const FeedbackInboxTab = ({ initialId }: { initialId?: string | null }) => {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<FeedbackType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(initialId || null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('feedback_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      // Resolve display names
      const userIds = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean))) as string[];
      const profileMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        (profiles || []).forEach((p: any) => {
          if (p.display_name) profileMap.set(p.user_id, p.display_name);
        });
      }

      setItems(
        (data || []).map((r: any) => ({
          ...r,
          user_display_name: r.user_id ? profileMap.get(r.user_id) : undefined,
        })),
      );
    } catch (err: any) {
      console.error('[FeedbackInbox] load failed', err);
      showError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter === 'open' && (r.status === 'resolved' || r.status === 'closed')) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (q) {
        const hay = [
          r.message,
          r.email || '',
          r.user_display_name || '',
          r.route || '',
          r.app_version || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, typeFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: items.length, bug: 0, idea: 0, question: 0, open: 0 };
    items.forEach((r) => {
      if (r.type === 'bug') c.bug++;
      if (r.type === 'idea') c.idea++;
      if (r.type === 'question') c.question++;
      if (r.status !== 'resolved' && r.status !== 'closed') c.open++;
    });
    return c;
  }, [items]);

  const updateStatus = async (id: string, status: FeedbackStatus) => {
    try {
      const { error } = await supabase
        .from('feedback_submissions')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      showSuccess(t('toasts.statusUpdated'));
    } catch (err: any) {
      showError(friendlyError(err));
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('Obrisati ovu povratnu informaciju? Ova radnja je nepovratna.')) return;
    try {
      const { error } = await supabase.from('feedback_submissions').delete().eq('id', id);
      if (error) throw error;
      setItems((prev) => prev.filter((r) => r.id !== id));
      showSuccess(t('toasts.deleted'));
    } catch (err: any) {
      showError(friendlyError(err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Otvoreno" value={counts.open} accent="text-primary" />
        <StatPill label="🐛 Bug" value={counts.bug} />
        <StatPill label="💡 Idea" value={counts.idea} />
        <StatPill label="❓ Q" value={counts.question} />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži poruke, email, rutu..."
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as FeedbackType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve vrste</SelectItem>
              <SelectItem value="bug">🐛 Bug</SelectItem>
              <SelectItem value="idea">💡 Ideja</SelectItem>
              <SelectItem value="question">❓ Pitanje</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Otvoreni (nije riješeno)</SelectItem>
              <SelectItem value="all">Svi statusi</SelectItem>
              <SelectItem value="new">Novo</SelectItem>
              <SelectItem value="triaged">Triaged</SelectItem>
              <SelectItem value="in_progress">U tijeku</SelectItem>
              <SelectItem value="resolved">Riješeno</SelectItem>
              <SelectItem value="closed">Zatvoreno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">{filtered.length} od {items.length}</p>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Osvježi
          </Button>
        </div>
      </div>

      {/* List */}
      {loading && items.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nema povratnih informacija</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const Icon = typeIcons[r.type] || MessageSquare;
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} className="bg-card border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                    aria-expanded={expanded}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={typeBadgeColors[r.type] || 'bg-muted'} variant="secondary">
                        <Icon className="w-3 h-3 mr-1" />
                        {typeLabels[r.type] || r.type}
                      </Badge>
                      {r.rating ? (
                        <span className="inline-flex items-center text-xs text-yellow-600 dark:text-yellow-400">
                          <Star className="w-3 h-3 fill-current mr-0.5" />
                          {r.rating}
                        </span>
                      ) : null}
                      <Badge className={statusColors[r.status] || 'bg-muted'} variant="secondary">
                        {statusLabels[r.status] || r.status}
                      </Badge>
                      {expanded ? <ChevronUp className="w-3 h-3 ml-auto text-muted-foreground" /> : <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" />}
                    </div>
                    <p className="text-sm line-clamp-2">{r.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {r.user_display_name || r.email || 'Anonimno'} · {format(new Date(r.created_at), 'dd. MMM yyyy. HH:mm', { locale: hrLocale })}
                      {r.route ? ` · ${r.route}` : ''}
                    </p>
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Poruka:</p>
                      <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <Monitor className="w-3 h-3" /> Dijagnostika:
                      </p>
                      <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/40 rounded-lg p-2 font-mono">
                        <p>Ruta: {r.route || '—'}</p>
                        <p>Verzija: {r.app_version || '—'}</p>
                        <p>Viewport: {r.viewport || '—'}</p>
                        <p>Platforma: {r.platform || '—'}</p>
                        <p>Jezik: {r.language || '—'}</p>
                        {r.user_agent ? <p className="break-all">UA: {r.user_agent}</p> : null}
                      </div>
                    </div>
                    {Array.isArray(r.console_tail) && r.console_tail.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Console ({r.console_tail.length}):</p>
                        <div className="text-[10px] leading-tight bg-background/60 border rounded p-2 max-h-48 overflow-auto font-mono">
                          {r.console_tail.map((entry: any, i: number) => (
                            <div key={i} className={
                              entry.level === 'error' ? 'text-destructive' :
                              entry.level === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-muted-foreground'
                            }>
                              [{entry.level}] {entry.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.email && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Email:</p>
                        <a
                          href={`mailto:${r.email}?subject=Re: vaša povratna informacija`}
                          className="text-sm text-primary hover:underline"
                        >
                          {r.email}
                        </a>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Status:</p>
                        <Select value={r.status} onValueChange={(val) => updateStatus(r.id, val as FeedbackStatus)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Novo</SelectItem>
                            <SelectItem value="triaged">Triaged</SelectItem>
                            <SelectItem value="in_progress">U tijeku</SelectItem>
                            <SelectItem value="resolved">Riješeno</SelectItem>
                            <SelectItem value="closed">Zatvoreno</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteItem(r.id)}
                        aria-label="Obriši"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StatPill = ({ label, value, accent }: { label: string; value: number; accent?: string }) => (
  <div className="bg-card border rounded-lg px-2 py-1.5 text-center">
    <div className={`text-base font-bold ${accent || ''}`}>{value}</div>
    <div className="text-[10px] text-muted-foreground leading-none mt-0.5">{label}</div>
  </div>
);
