import { useState, type TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Check, Lock, Loader2 } from 'lucide-react';
import { useStorage } from '@/contexts/StorageContext';
import { STORAGE_OPTIONS, StorageMode } from '@/lib/storage/types';
import { cn } from '@/lib/utils';
import { initLocalDB } from '@/lib/storage/indexedDB';
import logo from '@/assets/logo.webp';
import { useTranslation } from 'react-i18next';

const StorageSetup = () => {
  const navigate = useNavigate();
  const { storageMode: currentMode, setStorageMode } = useStorage();
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<StorageMode | null>(currentMode);
  const [isLoading, setIsLoading] = useState(false);

  const isChangingMode = !!currentMode;

  const handleGoBack = () => {
    if (isChangingMode) {
      navigate('/home');
    } else {
      navigate(-1);
    }
  };

  const handleTouchAction = (event: TouchEvent<HTMLElement>, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const handleSelectMode = (mode: StorageMode, available: boolean) => {
    if (!available) return;
    console.log('[StorageSetup] Selected:', mode);
    setSelectedMode(mode);
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
        navigate('/auth');
      } else {
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
    <div className="min-h-dvh bg-background overflow-y-auto safe-area-top safe-area-bottom">
      <div className="flex flex-col items-center px-6 pt-6 pb-10 min-h-dvh">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {isChangingMode && (
            <button
              type="button"
              onClick={handleGoBack}
              onTouchEnd={(event) => handleTouchAction(event, handleGoBack)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
              style={{ touchAction: 'manipulation' }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t('storage.back', 'Natrag')}</span>
            </button>
          )}

          {/* Kompaktni header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">V&M Balance</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isChangingMode
                ? t('storage.changeMode', 'Promijeni način pohrane podataka')
                : t('storage.whereToStore', 'Gdje želiš spremati svoje podatke?')}
            </p>
          </div>

          {/* Storage Options */}
          <div className="space-y-2.5 mb-5">
            {STORAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectMode(option.id, option.available)}
                onTouchEnd={(event) => handleTouchAction(event, () => handleSelectMode(option.id, option.available))}
                disabled={!option.available}
                className={cn(
                  'w-full p-3.5 rounded-2xl border-2 text-left transition-all relative',
                  selectedMode === option.id
                    ? 'border-primary bg-primary/5'
                    : option.available
                    ? 'border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border'
                    : 'border-border/30 bg-muted/20 opacity-60 cursor-not-allowed'
                )}
                style={{ touchAction: 'manipulation' }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{option.name}</span>
                      {option.comingSoon && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {t('storage.comingSoon', 'Uskoro')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {option.description}
                    </p>
                  </div>
                  {selectedMode === option.id && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Privacy Notice - kompaktno */}
          <div className="flex items-start gap-2.5 p-3 bg-muted/30 rounded-xl mb-4">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t('storage.privacyNotice', 'Tvoji financijski podaci su privatni. Lokalna pohrana nikad ne napušta tvoj uređaj. Cloud opcije koriste enkripciju za zaštitu podataka.')}
            </p>
          </div>

          {/* Continue Button */}
          <Button
            type="button"
            onClick={() => void handleContinue()}
            onTouchEnd={(event) => handleTouchAction(event, () => void handleContinue())}
            disabled={!selectedMode || isLoading || (isChangingMode && selectedMode === currentMode)}
            className="w-full h-12 rounded-xl text-base font-medium gap-2"
            style={{ touchAction: 'manipulation' }}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading
              ? t('storage.setting', 'Postavljam...')
              : isChangingMode
              ? t('storage.saveChanges', 'Spremi promjene')
              : t('storage.continue', 'Nastavi')}
            {!isLoading && <ArrowRight className="w-4 h-4" />}
          </Button>

          {/* Skip/Cancel */}
          {isChangingMode ? (
            <button
              type="button"
              onClick={handleGoBack}
              onTouchEnd={(event) => handleTouchAction(event, handleGoBack)}
              className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              {t('common.cancel', 'Odustani')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStorageMode('local');
                navigate('/home');
              }}
              onTouchEnd={(event) => handleTouchAction(event, () => {
                setStorageMode('local');
                navigate('/home');
              })}
              className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              {t('storage.skipForNow', 'Preskoči za sada (lokalna pohrana)')}
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default StorageSetup;
