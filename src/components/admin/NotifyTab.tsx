import { Bell, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface NotifyTabProps {
  notifTitle: string;
  setNotifTitle: (v: string) => void;
  notifMessage: string;
  setNotifMessage: (v: string) => void;
  sendingNotif: boolean;
  onSend: () => void;
}

export const NotifyTab = ({
  notifTitle,
  setNotifTitle,
  notifMessage,
  setNotifMessage,
  sendingNotif,
  onSend,
}: NotifyTabProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-card border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Pošalji obavijest svim korisnicima</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Naslov</label>
            <Input
              placeholder={t('placeholders.notificationTitle')}
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Poruka</label>
            <Textarea
              placeholder="Unesite tekst obavijesti..."
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              rows={4}
            />
          </div>
          <Button
            onClick={onSend}
            disabled={sendingNotif || !notifTitle.trim() || !notifMessage.trim()}
            className="w-full"
          >
            {sendingNotif ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Pošalji obavijest
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Obavijest će biti poslana svim registriranim korisnicima i pojavit će se u njihovim push obavijestima.
      </p>
    </div>
  );
};
