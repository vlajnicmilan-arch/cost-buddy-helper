import { Bell, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface BroadcastLangPayload {
  title_hr: string;
  title_en: string;
  title_de: string;
  message_hr: string;
  message_en: string;
  message_de: string;
}

interface NotifyTabProps {
  payload: BroadcastLangPayload;
  onChange: (patch: Partial<BroadcastLangPayload>) => void;
  sendingNotif: boolean;
  onSend: () => void;
}

export const NotifyTab = ({ payload, onChange, sendingNotif, onSend }: NotifyTabProps) => {
  const { t } = useTranslation();
  const canSend = payload.title_hr.trim().length > 0 && payload.message_hr.trim().length > 0;

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-card border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">{t('admin.sendNotificationAll')}</h3>
        </div>

        <p className="text-xs text-muted-foreground">{t('admin.broadcastLangNote')}</p>

        {(['hr', 'en', 'de'] as const).map((lang) => {
          const titleKey = `title_${lang}` as const;
          const messageKey = `message_${lang}` as const;
          return (
            <div key={lang} className="space-y-3 border-t pt-3 first:border-t-0 first:pt-0">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t(`admin.title${lang.toUpperCase() as 'HR' | 'EN' | 'DE'}` as const)}
                </label>
                <Input
                  value={payload[titleKey]}
                  onChange={(e) => onChange({ [titleKey]: e.target.value } as Partial<BroadcastLangPayload>)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {t(`admin.message${lang.toUpperCase() as 'HR' | 'EN' | 'DE'}` as const)}
                </label>
                <Textarea
                  value={payload[messageKey]}
                  onChange={(e) => onChange({ [messageKey]: e.target.value } as Partial<BroadcastLangPayload>)}
                  rows={3}
                />
              </div>
            </div>
          );
        })}

        <Button onClick={onSend} disabled={sendingNotif || !canSend} className="w-full">
          {sendingNotif ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {t('admin.sendBroadcast')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">{t('admin.broadcastFooter')}</p>
    </div>
  );
};
