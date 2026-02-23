import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Bug, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { APP_VERSION } from '@/lib/version';

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BugReportDialog = ({ open, onOpenChange }: BugReportDialogProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { storageMode } = useStorage();

  const getDeviceInfo = () => ({
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    storageMode,
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
  });

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Molimo popunite naslov i opis problema');
      return;
    }

    if (!user) {
      toast.error('Morate biti prijavljeni za prijavu problema');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('bug_reports').insert({
        user_id: user.id,
        title: title.trim().slice(0, 200),
        description: description.trim().slice(0, 2000),
        device_info: getDeviceInfo(),
      });

      if (error) throw error;

      toast.success('Problem uspješno prijavljen! Hvala na povratnoj informaciji.');
      setTitle('');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      console.error('Bug report error:', error);
      toast.error('Greška pri slanju prijave. Pokušajte ponovno.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-destructive" />
            Prijavi problem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bug-title">Naslov</Label>
            <Input
              id="bug-title"
              placeholder="Kratki opis problema..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-description">Opis problema</Label>
            <Textarea
              id="bug-description"
              placeholder="Opišite što se dogodilo, što ste očekivali i korake za reprodukciju..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/2000
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Automatski će se priložiti informacije o uređaju i verziji aplikacije.
          </p>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !description.trim()}
            className="w-full gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Pošalji prijavu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
