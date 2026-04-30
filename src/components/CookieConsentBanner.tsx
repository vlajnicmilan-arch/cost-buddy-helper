import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Shield, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isPublicRoute } from '@/lib/publicRoutes';
import {
  acceptAll,
  rejectAll,
  setConsent,
  hasDecidedConsent,
  migrateLegacyConsent,
  hasConsent as hasConsentForCategory,
} from '@/lib/consentManager';

// Legacy export kept for backward compatibility with any callers.
export const hasGdprConsent = () => hasDecidedConsent();
export const hasAnalyticsConsent = () => hasConsentForCategory('analytics');
export const hasMarketingConsent = () => hasConsentForCategory('marketing');

export const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();

  const onPublicRoute = isPublicRoute(location.pathname);

  useEffect(() => {
    if (onPublicRoute) {
      setVisible(false);
      return;
    }
    migrateLegacyConsent();
    const timer = setTimeout(() => {
      if (!hasDecidedConsent()) setVisible(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [onPublicRoute]);

  const close = () => {
    setVisible(false);
    setShowDetails(false);
  };

  const handleAcceptAll = () => {
    acceptAll();
    close();
  };

  const handleRejectAll = () => {
    rejectAll();
    close();
  };

  const handleSavePreferences = () => {
    setConsent({ analytics, marketing });
    close();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[9999] p-4 pb-safe"
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-consent-title"
        >
          <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 id="cookie-consent-title" className="font-semibold text-sm text-foreground">
                  {t('gdpr.bannerTitle')}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('gdpr.bannerTextV2')}
                </p>
              </div>
            </div>

            {showDetails && (
              <div className="space-y-2 pt-2 border-t border-border">
                {/* Necessary — always on */}
                <div className="flex items-start justify-between gap-3 py-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-foreground">
                      {t('gdpr.cat.necessary')}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t('gdpr.cat.necessaryDesc')}
                    </p>
                  </div>
                  <Switch checked disabled aria-label={t('gdpr.cat.necessary')} />
                </div>

                {/* Analytics */}
                <div className="flex items-start justify-between gap-3 py-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-foreground">
                      {t('gdpr.cat.analytics')}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t('gdpr.cat.analyticsDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={analytics}
                    onCheckedChange={setAnalytics}
                    aria-label={t('gdpr.cat.analytics')}
                  />
                </div>

                {/* Marketing */}
                <div className="flex items-start justify-between gap-3 py-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-foreground">
                      {t('gdpr.cat.marketing')}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t('gdpr.cat.marketingDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={marketing}
                    onCheckedChange={setMarketing}
                    aria-label={t('gdpr.cat.marketing')}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {!showDetails ? (
                <>
                  <Button
                    size="sm"
                    onClick={handleAcceptAll}
                    className="flex-1 min-w-[100px] h-9 rounded-xl text-xs font-medium"
                  >
                    {t('gdpr.acceptAll')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRejectAll}
                    className="flex-1 min-w-[100px] h-9 rounded-xl text-xs font-medium"
                  >
                    {t('gdpr.rejectAll')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowDetails(true)}
                    className="h-9 rounded-xl text-xs text-muted-foreground"
                    aria-label={t('gdpr.customize')}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    {t('gdpr.customize')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleSavePreferences}
                    className="flex-1 h-9 rounded-xl text-xs font-medium"
                  >
                    {t('gdpr.savePreferences')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRejectAll}
                    className="h-9 rounded-xl text-xs"
                  >
                    {t('gdpr.rejectAll')}
                  </Button>
                </>
              )}
            </div>

            <button
              onClick={() => navigate('/privacy-policy')}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              {t('gdpr.privacyPolicy')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
