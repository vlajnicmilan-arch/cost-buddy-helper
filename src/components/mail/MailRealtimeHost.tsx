import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useMailRealtime } from '@/hooks/useMailRealtime';
import { useStatementLinkResolver } from '@/hooks/useStatementLinkResolver';
import { showSuccess } from '@/hooks/useStatusFeedback';

/**
 * Jedina točka montiranja živog mail kanala (App.tsx).
 * Kartica na home-u i red „Na pregled" osvježe se sami; korisnik dobije
 * brand obavijest (CentarNote) s prečicom na /dokumenti.
 */
export const MailRealtimeHost = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAccess } = useMailImportAccess();

  const onNewPending = useCallback(() => {
    showSuccess(t('documents.liveNotice', 'Stigao dokument na pregled'), {
      module: 'centar',
      action: {
        label: t('documents.open', 'Otvori Dokumente'),
        onClick: () => navigate('/dokumenti'),
      },
    });
  }, [t, navigate]);

  useMailRealtime({ enabled: hasAccess, onNewPending });
  // Veza kartica izvoda -> zabiljezeni uvoz zivi globalno (prezivi navigaciju/skicu).
  useStatementLinkResolver();

  return null;
};

export default MailRealtimeHost;
