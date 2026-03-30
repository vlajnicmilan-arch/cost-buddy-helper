import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Check, Lock, Loader2 } from 'lucide-react';
import { useStorage } from '@/contexts/StorageContext';
import { useAuth } from '@/hooks/useAuth';
import { STORAGE_OPTIONS, StorageMode } from '@/lib/storage/types';
import { cn } from '@/lib/utils';
import { initLocalDB } from '@/lib/storage/indexedDB';
import logo from '@/assets/logo.png';
import { useTranslation } from 'react-i18next';

const StorageSetup = () => {
  const navigate = useNavigate();
  const { storageMode: currentMode, setStorageMode } = useStorage();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<StorageMode | null>(currentMode);
  const [isLoading, setIsLoading] = useState(false);

  // Check if user came from settings (has existing mode)
  const isChangingMode = !!currentMode;

  const handleGoBack = () => {
    // Always go back to home when changing mode from settings
    if (isChangingMode) {
      navigate('/home');
    } else {
      navigate(-1);
    }
  };

  const handleContinue = async () => {
    if (!selectedMode) return;

    setIsLoading(true);

    try {
      if (selectedMode === 'local') {
        await initLocalDB();
        setStorageMode('local');
        navigate('/home');
      } else if (selectedMode === 'cloud') {
        setStorageMode('cloud');
        // Routing to /auth or /home is handled by App.tsx centrally
        navigate('/auth');
      } else {
        // Google Drive / iCloud - coming soon
        setStorageMode(selectedMode);
        navigate('/home');
      }
    } catch (error) {
      console.error('Error setting up storage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Back button - only show when changing mode */}
        {isChangingMode && (
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t('storage.back', 'Natrag')}</span>
          </button>
        )}

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4">
            <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
          <p className="text-muted-foreground mt-2">
            {isChangingMode 
              ? t('storage.changeMode', 'Promijeni način pohrane podataka')
              : t('storage.whereToStore', 'Gdje želiš spremati svoje podatke?')}
          </p>
        </div>

        {/* Storage Options */}
        <div className="space-y-3 mb-8">
          <AnimatePresence>
            {STORAGE_OPTIONS.map((option, index) => (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => option.available && setSelectedMode(option.id)}
                disabled={!option.available}
                className={cn(
                  "w-full p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden",
                  selectedMode === option.id
                    ? "border-primary bg-primary/5"
                    : option.available
                    ? "border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border"
                    : "border-border/30 bg-muted/20 opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{option.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {option.name}
                      </span>
                      {option.comingSoon && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {t('storage.comingSoon', 'Uskoro')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>
                  {selectedMode === option.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                    >
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>

        {/* Privacy Notice */}
        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl mb-6">
          <Lock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            {t('storage.privacyNotice', 'Tvoji financijski podaci su privatni. Lokalna pohrana nikad ne napušta tvoj uređaj. Cloud opcije koriste enkripciju za zaštitu podataka.')}
          </p>
        </div>

        {/* Continue Button */}
        <Button
          onClick={handleContinue}
          disabled={!selectedMode || isLoading || (isChangingMode && selectedMode === currentMode)}
          className="w-full h-14 rounded-xl text-lg font-medium gap-2"
        >
          {isLoading ? t('storage.setting', 'Postavljam...') : isChangingMode ? t('storage.saveChanges', 'Spremi promjene') : t('storage.continue', 'Nastavi')}
          <ArrowRight className="w-5 h-5" />
        </Button>

        {/* Skip/Cancel button */}
        {isChangingMode ? (
          <button
            onClick={handleGoBack}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Odustani
          </button>
        ) : (
          <button
            onClick={() => {
              setStorageMode('local');
              navigate('/home');
            }}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Preskoči za sada (lokalna pohrana)
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default StorageSetup;
