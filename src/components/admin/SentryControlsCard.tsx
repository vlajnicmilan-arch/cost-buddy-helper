import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ExternalLink, Bug, CheckCircle2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PulseMetricCard } from './PulseMetricCard';
import {
  getSentryDashboardUrl,
  triggerSentryTestError,
  isSentryInitialized,
} from '@/lib/sentry';

export const SentryControlsCard = () => {
  const { t } = useTranslation();
  const [testSent, setTestSent] = useState(false);

  const initialized = isSentryInitialized();

  const openDashboard = async () => {
    const url = getSentryDashboardUrl();
    try {
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const sendTestError = () => {
    try {
      triggerSentryTestError();
    } catch (e) {
      // Sentry global handler will pick it up via the throw bubbling.
      // We also explicitly capture in case the boundary isn't above this.
      import('@/lib/sentry').then(({ captureSentryException }) => {
        captureSentryException(e, { source: 'admin_test_button' });
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    }
  };

  return (
    <PulseMetricCard
      title={t('admin.pulse.sentry.title', 'Sentry — Error Monitoring')}
      icon={<Bug className="w-3.5 h-3.5" />}
    >
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {initialized
            ? t('admin.pulse.sentry.statusOn', 'Aktivno · EU region (Frankfurt)')
            : t(
                'admin.pulse.sentry.statusOff',
                'Neaktivno (development mode ili init pao)'
              )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openDashboard}
            className="h-8 text-xs"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {t('admin.pulse.sentry.openDashboard', 'Otvori Sentry')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={sendTestError}
            disabled={!initialized || testSent}
            className="h-8 text-xs"
          >
            {testSent ? (
              <>
                <CheckCircle2 className="w-3 h-3 mr-1 text-primary" />
                {t('admin.pulse.sentry.testSent', 'Poslano!')}
              </>
            ) : (
              <>
                <Bug className="w-3 h-3 mr-1" />
                {t('admin.pulse.sentry.testError', 'Test error')}
              </>
            )}
          </Button>
        </div>
      </div>
    </PulseMetricCard>
  );
};
