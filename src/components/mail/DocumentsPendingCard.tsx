import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FileClock, ChevronRight } from 'lucide-react';

/**
 * Kartica „Dokumenti na pregled" na početnom ekranu.
 *
 * Jantarni identitet (`--document-pending`) — nije upozorenje, nego papir koji
 * čeka odluku. Vidljiva ISKLJUČIVO uz pravo `mail_uvoz` i kad ima što čekati;
 * gate je na strani pozivatelja, ova komponenta samo crta.
 */
export const DocumentsPendingCard = ({ count }: { count: number }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      data-testid="documents-pending-card"
      onClick={() => navigate('/dokumenti')}
      className="mb-4 flex w-full min-h-[44px] items-center gap-3 rounded-2xl border border-document-pending/40 bg-document-pending-surface/60 p-4 text-left transition-colors hover:bg-document-pending-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-document-pending"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-document-pending/15">
        <FileClock className="h-5 w-5 text-document-pending" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {t('documents.pendingCard.title', 'Dokumenti na pregled')}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t('documents.pendingCard.subtitle', '{{count}} dokumenata čeka tvoju potvrdu', { count })}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-document-pending px-2.5 py-1 text-xs font-bold text-document-pending-foreground">
        {count}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
};
