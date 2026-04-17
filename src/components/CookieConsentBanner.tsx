import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isPublicRoute } from '@/lib/publicRoutes';

const CONSENT_KEY = 'gdpr_consent_accepted';
const CONSENT_DATE_KEY = 'gdpr_consent_date';

export const hasGdprConsent = () => localStorage.getItem(CONSENT_KEY) === 'true';

export const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();

  const onPublicRoute = isPublicRoute(location.pathname);

  useEffect(() => {
    if (onPublicRoute) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!hasGdprConsent()) {
        setVisible(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [onPublicRoute]);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'true');
    localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[9999] p-4 pb-safe"
        >
          <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-semibold text-sm text-foreground">{t('gdpr.bannerTitle', 'Privatnost i pohrana podataka')}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('gdpr.bannerText', 'Ova aplikacija koristi localStorage i IndexedDB za pohranu vaših postavki i financijskih podataka na uređaju. Ne koristimo marketinške kolačiće niti pratimo vaše aktivnosti izvan aplikacije.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAccept}
                className="flex-1 h-9 rounded-xl text-xs font-medium"
              >
                {t('gdpr.accept', 'Prihvaćam')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/privacy-policy')}
                className="h-9 rounded-xl text-xs text-muted-foreground"
              >
                {t('gdpr.privacyPolicy', 'Politika privatnosti')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
