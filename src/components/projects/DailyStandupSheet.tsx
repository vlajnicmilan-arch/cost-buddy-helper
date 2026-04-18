import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Sparkles, Loader2, Send } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';

interface DailyStandupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  /** Optional callback called when AI returns structured items so caller can act on them */
  onResult?: (result: {
    summary?: string | null;
    workers?: { name?: string; hours?: number; task?: string }[];
    materials?: { name?: string; quantity?: number; unit?: string }[];
    notes?: string | null;
  }) => void;
}

// Simple SpeechRecognition typing
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: any) => void;
  onerror: (e: any) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

const getRecognition = (): SpeechRecognitionLike | null => {
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const r: SpeechRecognitionLike = new SR();
  r.lang = 'hr-HR';
  r.interimResults = true;
  r.continuous = true;
  return r;
};

export const DailyStandupSheet = ({
  open,
  onOpenChange,
  projectId,
  projectName,
  onResult,
}: DailyStandupSheetProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognitionLike | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const startRecording = () => {
    const r = getRecognition();
    if (!r) {
      showError(t('projects.standup.noVoice', 'Glasovni unos nije podržan na ovom uređaju.'));
      return;
    }
    let buffer = text ? text + ' ' : '';
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const s = e.results[i];
        if (s.isFinal) buffer += s[0].transcript + ' ';
        else interim += s[0].transcript;
      }
      setText((buffer + interim).replace(/\s+/g, ' '));
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);
    try {
      r.start();
      setRecognition(r);
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const stopRecording = () => {
    try { recognition?.stop(); } catch {}
    setRecording(false);
  };

  const sendToAI = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-standup', {
        body: { text: trimmed, project_name: projectName },
      });

      if (error) throw error;

      const parsed = data?.result || {};
      onResult?.(parsed);
      showSuccess(t('projects.standup.processed', 'Izvještaj strukturiran'));
      setText('');
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      showError(err?.message || t('common.error', 'Greška'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) stopRecording(); onOpenChange(o); }}>
      <SheetContent side="bottom" className="h-[80dvh] sm:h-auto sm:max-h-[85dvh] flex flex-col gap-3 p-4 rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('projects.standup.title', 'Dnevni izvještaj')}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {t('projects.standup.subtitle', 'Reci ili napiši što je danas rađeno na projektu. AI će strukturirati radnike, materijal i ključne stavke.')}
          </p>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <Label className="text-xs">{t('projects.standup.dictate', 'Diktiraj ili upiši izvještaj')}</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(
              'projects.standup.placeholder',
              'npr. Marko i Ivan radili 8h na žbukanju prizemlja. Potrošeno 12 vreća žbuke i 3 m² mreže...'
            )}
            className="flex-1 min-h-[140px] resize-none"
          />
          <p className="text-[10px] text-muted-foreground">
            {t('projects.standup.voiceHint', 'Mikrofon koristi prepoznavanje govora preglednika (Chrome/Android).')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!recording ? (
            <Button variant="outline" onClick={startRecording} className="gap-2" disabled={aiLoading}>
              <Mic className="w-4 h-4" />
              {t('projects.standup.startVoice', 'Snimaj')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording} className="gap-2">
              <MicOff className="w-4 h-4" />
              {t('projects.standup.stopVoice', 'Zaustavi')}
            </Button>
          )}
          <Button onClick={sendToAI} disabled={aiLoading || !text.trim()} className="gap-2">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t('projects.standup.process', 'Strukturiraj AI-jem')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
