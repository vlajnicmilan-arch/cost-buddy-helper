import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Sparkles, Loader2, Send, Users, Package } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectWithOwnership } from '@/types/project';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';

interface DailyStandupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Available projects for the user to assign report to */
  projects: ProjectWithOwnership[];
  /** Optional pre-selected project id */
  initialProjectId?: string | null;
  /** Called after work entries are persisted so caller can refresh stats */
  onApplied?: (projectId: string) => void;
}

interface ParsedWorker { name?: string; hours?: number; task?: string }
interface ParsedMaterial { name?: string; quantity?: number; unit?: string }
interface ParsedResult {
  summary?: string | null;
  workers?: ParsedWorker[];
  materials?: ParsedMaterial[];
  notes?: string | null;
}

const normalizeName = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();

export const DailyStandupSheet = ({
  open,
  onOpenChange,
  projects,
  initialProjectId,
  onApplied,
}: DailyStandupSheetProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [projectId, setProjectId] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [workerSelections, setWorkerSelections] = useState<Record<number, boolean>>({});
  const [projectWorkers, setProjectWorkers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [applying, setApplying] = useState(false);
  const [workDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Centralized voice dictation — append transcripts onto current text
  const {
    recording,
    start: startVoice,
    stop: stopVoice,
    supported: voiceSupported,
    showPermissionHelp,
    setShowPermissionHelp,
    errorKind: voiceErrorKind,
    diagnosticCode: voiceDiagnosticCode,
    permissionState: voicePermissionState,
    isAndroidRuntime,
  } = useVoiceDictation({
    onTranscript: (transcript, isFinal) => {
      setText(prev => {
        const base = prev.trim();
        const next = base ? `${base} ${transcript}` : transcript;
        return next.replace(/\s+/g, ' ');
      });
      if (isFinal) {
        // small UX hint on first final
      }
    },
  });

  // Reset on close
  useEffect(() => {
    if (!open) {
      setText('');
      setParsed(null);
      setWorkerSelections({});
      stopVoice();
    }
  }, [open, stopVoice]);

  // Set default project
  useEffect(() => {
    if (!open) return;
    const next = initialProjectId || projects[0]?.id || '';
    setProjectId(next);
  }, [open, initialProjectId, projects]);

  // Load workers when project changes
  useEffect(() => {
    if (!projectId) { setProjectWorkers([]); return; }
    (async () => {
      const { data } = await (supabase
        .from('project_workers') as any)
        .select('id, first_name, last_name')
        .eq('project_id', projectId);
      setProjectWorkers(data || []);
    })();
  }, [projectId]);

  const selectedProject = useMemo(() => projects.find(p => p.id === projectId), [projects, projectId]);

  const startRecording = async () => {
    if (!voiceSupported) {
      showError(t('projects.standup.noVoice', 'Glasovni unos nije podržan na ovom uređaju.'));
      return;
    }
    await startVoice();
    if (recording) {
      showSuccess(t('projects.standup.recordingStarted', 'Snimanje pokrenuto — govori...'));
    }
  };

  const stopRecording = () => {
    stopVoice();
  };

  const sendToAI = async () => {
    const trimmed = text.trim();
    if (!trimmed || !selectedProject) return;
    setAiLoading(true);
    try {
      const workerNames = projectWorkers.map(w => `${w.first_name} ${w.last_name}`.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke('parse-standup', {
        body: { text: trimmed, project_name: selectedProject.name, worker_names: workerNames },
      });
      if (error) throw error;
      const result: ParsedResult = data?.result || {};
      setParsed(result);
      // Pre-select all workers that match
      const sel: Record<number, boolean> = {};
      (result.workers || []).forEach((w, idx) => {
        sel[idx] = !!matchWorker(w.name);
      });
      setWorkerSelections(sel);
      showSuccess(t('projects.standup.processed', 'Izvještaj strukturiran'));
    } catch (err: any) {
      console.error(err);
      showError(err?.message || t('common.error', 'Greška'));
    } finally {
      setAiLoading(false);
    }
  };

  const matchWorker = (name?: string): { id: string; first_name: string; last_name: string } | null => {
    if (!name) return null;
    const target = normalizeName(name);
    return projectWorkers.find(w => {
      const full = normalizeName(`${w.first_name} ${w.last_name}`);
      return full === target || full.includes(target) || target.includes(full);
    }) || null;
  };

  const applyToProject = async () => {
    if (!parsed || !projectId) return;
    const summary = parsed.summary || null;
    const notes = parsed.notes || null;
    const noteText = [summary, notes].filter(Boolean).join(' — ');

    const entriesToInsert: Array<{
      project_id: string;
      worker_id: string;
      work_date: string;
      actual_hours: number;
      scheduled_hours: number;
      note: string | null;
    }> = [];

    (parsed.workers || []).forEach((w, idx) => {
      if (!workerSelections[idx]) return;
      const matched = matchWorker(w.name);
      if (!matched) return;
      const hours = Number(w.hours) || 0;
      if (hours <= 0) return;
      const taskNote = [w.task, noteText].filter(Boolean).join(' — ') || null;
      entriesToInsert.push({
        project_id: projectId,
        worker_id: matched.id,
        work_date: workDate,
        actual_hours: hours,
        scheduled_hours: hours,
        note: taskNote,
      });
    });

    if (entriesToInsert.length === 0) {
      showError(t('projects.standup.nothingToApply', 'Nema radnih sati za spremanje.'));
      return;
    }

    setApplying(true);
    try {
      const { error } = await (supabase.from('project_work_entries') as any).insert(entriesToInsert);
      if (error) throw error;
      showSuccess(t('projects.standup.applied', '{{count}} unosa rada spremljeno', { count: entriesToInsert.length }));
      onApplied?.(projectId);
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      showError(err?.message || t('common.error', 'Greška'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) stopRecording(); onOpenChange(o); }}>
      <SheetContent side="bottom" className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] flex flex-col gap-3 p-4 rounded-t-2xl overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('projects.standup.title', 'Dnevni izvještaj')}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {t('projects.standup.subtitle', 'Reci ili napiši što je danas rađeno na projektu. AI će strukturirati radnike, materijal i ključne stavke.')}
          </p>
        </SheetHeader>

        <div className="space-y-2">
          <Label className="text-xs">{t('projects.standup.project', 'Projekt')}</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder={t('projects.standup.pickProject', 'Odaberi projekt')} />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span>{p.icon || '📁'}</span>
                    <span className="truncate">{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <Label className="text-xs">{t('projects.standup.dictate', 'Diktiraj ili upiši izvještaj')}</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              'projects.standup.placeholder',
              'npr. Marko i Ivan radili 8h na žbukanju prizemlja. Potrošeno 12 vreća žbuke i 3 m² mreže...'
            )}
            className="min-h-[120px] resize-none"
          />
          <p className="text-[10px] text-muted-foreground">
            {t('projects.standup.voiceHint', 'Mikrofon koristi prepoznavanje govora preglednika (Chrome/Android).')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!recording ? (
            <Button variant="outline" onClick={startRecording} className="gap-2" disabled={aiLoading || applying}>
              <Mic className="w-4 h-4" />
              {t('projects.standup.startVoice', 'Snimaj')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording} className="gap-2 relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white animate-pulse" />
              <MicOff className="w-4 h-4 ml-3" />
              {t('projects.standup.stopVoice', 'Zaustavi')}
            </Button>
          )}
          <Button onClick={sendToAI} disabled={aiLoading || applying || !text.trim() || !projectId} className="gap-2">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t('projects.standup.process', 'Strukturiraj AI-jem')}
          </Button>
        </div>

        {/* AI Result preview */}
        {parsed && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            {parsed.summary && (
              <div className="text-xs bg-primary/5 border border-primary/20 rounded-lg p-2">
                <span className="font-medium text-primary">{t('projects.standup.summary', 'Sažetak')}: </span>
                <span className="text-foreground">{parsed.summary}</span>
              </div>
            )}

            {(parsed.workers || []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  {t('projects.standup.workers', 'Radnici')}
                </div>
                <div className="space-y-1.5">
                  {(parsed.workers || []).map((w, idx) => {
                    const matched = matchWorker(w.name);
                    return (
                      <label
                        key={idx}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer ${
                          matched ? 'border-primary/30 bg-primary/5' : 'border-border/40 opacity-60'
                        }`}
                      >
                        <Checkbox
                          checked={!!workerSelections[idx]}
                          disabled={!matched}
                          onCheckedChange={(c) => setWorkerSelections(prev => ({ ...prev, [idx]: !!c }))}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {w.name || t('projects.standup.unknownWorker', 'Nepoznat radnik')}
                            {!matched && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                ({t('projects.standup.notInTeam', 'nije u timu')})
                              </span>
                            )}
                          </div>
                          {w.task && <div className="text-muted-foreground truncate">{w.task}</div>}
                        </div>
                        <div className="text-xs font-semibold text-primary shrink-0">
                          {Number(w.hours) || 0}h
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {(parsed.materials || []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Package className="w-3.5 h-3.5 text-primary" />
                  {t('projects.standup.materials', 'Materijal')}
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {(parsed.materials || []).map((m, idx) => (
                    <div key={idx} className="text-xs bg-muted/30 border border-border/40 rounded-md px-2 py-1 flex justify-between">
                      <span className="truncate">{m.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {m.quantity ?? ''} {m.unit ?? ''}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t('projects.standup.materialsHint', 'Materijal je informativan — dodaj kao trošak ručno preko Brzog računa.')}
                </p>
              </div>
            )}

            <Button onClick={applyToProject} disabled={applying} className="w-full gap-2">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {t('projects.standup.apply', 'Spremi unose rada')}
            </Button>
          </div>
        )}
      </SheetContent>

      <AlertDialog open={showPermissionHelp} onOpenChange={setShowPermissionHelp}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <MicOff className="w-4 h-4 text-destructive" />
              {voiceErrorKind === 'unsupported'
                ? t('voice.unsupportedTitle', 'Glasovni unos nije dostupan')
                : voiceErrorKind === 'service-unavailable'
                ? t('voice.serviceTitle', 'Diktiranje trenutno nije dostupno')
                : t('projects.standup.permissionTitle', 'Mikrofon je blokiran')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                {voiceErrorKind === 'unsupported' && (
                  <p className="text-muted-foreground whitespace-pre-line">
                    {t(
                      'voice.unsupportedBody',
                      'Vaša verzija aplikacije ili preglednika ne podržava glasovni unos. Molimo upišite tekst rukom u polje iznad — AI će ga svejedno strukturirati.'
                    )}
                  </p>
                )}

                {voiceErrorKind === 'service-unavailable' && (
                  <p className="text-muted-foreground whitespace-pre-line">
                    {t(
                      'voice.serviceBody',
                      'Servis za prepoznavanje govora se ne može pokrenuti. Provjerite internetsku vezu i pokušajte ponovno. Ako i dalje ne radi, otvorite aplikaciju u Chrome pregledniku.'
                    )}
                  </p>
                )}

                {(voiceErrorKind === 'permission-denied' || voiceErrorKind === 'unknown' || voiceErrorKind === null) && (
                  <>
                    <p className="text-muted-foreground">
                      {t('projects.standup.permissionIntro', 'Da bi snimanje radilo, moraš dopustiti pristup mikrofonu. Evo kako:')}
                    </p>

                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      <p className="font-semibold text-xs uppercase tracking-wide text-primary">
                        {t('projects.standup.permissionAndroid', 'Android (Chrome / Centar app)')}
                      </p>
                      <ol className="list-decimal pl-4 space-y-1 text-xs">
                        <li>{t('projects.standup.permAndroid1', 'Otvori Postavke telefona → Aplikacije.')}</li>
                        <li>{t('projects.standup.permAndroid2', 'Pronađi "Centar" (ili "Chrome" ako koristiš preglednik).')}</li>
                        <li>{t('projects.standup.permAndroid3', 'Otvori Dozvole → Mikrofon → odaberi "Dopusti".')}</li>
                        <li>{t('projects.standup.permAndroid4', 'Vrati se u aplikaciju i klikni Snimaj ponovno.')}</li>
                      </ol>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      <p className="font-semibold text-xs uppercase tracking-wide text-primary">
                        {t('projects.standup.permissionChromeWeb', 'Chrome (web preglednik)')}
                      </p>
                      <ol className="list-decimal pl-4 space-y-1 text-xs">
                        <li>{t('projects.standup.permChrome1', 'Klikni ikonu lokota 🔒 lijevo od adrese stranice.')}</li>
                        <li>{t('projects.standup.permChrome2', 'Pronađi "Mikrofon" i postavi na "Dopusti".')}</li>
                        <li>{t('projects.standup.permChrome3', 'Osvježi stranicu i pokušaj ponovno.')}</li>
                      </ol>
                    </div>
                  </>
                )}

                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
                  <p className="text-[11px] font-semibold text-foreground">
                    {t('voice.diagnosticTitle', 'Dijagnostika')}
                  </p>
                  <p className="text-[11px] text-muted-foreground break-all">
                    {t('voice.diagnosticCode', 'Kod greške')}: {voiceDiagnosticCode || 'n/a'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t('voice.diagnosticPermission', 'Stanje dozvole')}: {voicePermissionState}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t('voice.diagnosticRuntime', 'Runtime')}: {isAndroidRuntime ? 'android-webview' : 'browser'}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('projects.standup.permissionFallback', 'Ako i dalje ne radi, jednostavno upiši izvještaj rukom u polje iznad — AI će ga svejedno strukturirati.')}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t('common.understood', 'Razumijem')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};
