/**
 * One silent, dismissible reminder for accounts whose name is a single word.
 * Never blocking, never returns after being dismissed.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'add_surname_nudge_dismissed';

export const hasSingleWordName = (name: string | null | undefined): boolean => {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).length === 1;
};

interface Props {
  displayName: string | null | undefined;
}

export const AddSurnameNudge = ({ displayName }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return true;
    }
  });

  if (dismissed || !hasSingleWordName(displayName)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-border/50 bg-muted/40 p-3">
      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{t('settings.addSurnameNudge', 'Dodaj prezime da te suradnici prepoznaju')}</p>
        <Button
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => {
            dismiss();
            navigate('/settings');
          }}
        >
          {t('settings.addSurnameNudgeCta', 'Dopuni ime')}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label={t('common.dismiss', 'Odbaci')}
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
