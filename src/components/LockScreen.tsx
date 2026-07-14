import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppLock } from '@/contexts/AppLockContext';
import { Fingerprint, Delete, Lock, ScanFace } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { useTranslation } from 'react-i18next';
import { useHaptics } from '@/hooks/useHaptics';
import { useLocation } from 'react-router-dom';
import { isPublicRoute } from '@/lib/publicRoutes';

export const LockScreen = () => {
  const { isLocked, unlock, unlockBiometric, biometricEnabled, biometricType, loading } = useAppLock();
  const location = useLocation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const { t } = useTranslation();
  const biometricAttempted = useRef(false);
  const { lightTap, errorVibration } = useHaptics();
  const onPublicRoute = isPublicRoute(location.pathname);

  // Try biometric on mount
  useEffect(() => {
    if (isLocked && biometricEnabled && !biometricAttempted.current) {
      biometricAttempted.current = true;
      unlockBiometric();
    }
  }, [isLocked, biometricEnabled]);

  // Reset biometric flag when locked again
  useEffect(() => {
    if (!isLocked) {
      biometricAttempted.current = false;
    }
  }, [isLocked]);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    lightTap();
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4) {
      setTimeout(async () => {
        const success = await unlock(newPin);
        if (!success) {
          setError(true);
          setShake(true);
          errorVibration();
          setTimeout(() => {
            setPin('');
            setShake(false);
          }, 600);
        }
      }, 100);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  if (!isLocked || loading || onPublicRoute) return null;

  const BiometricIcon = biometricType === 'face' ? ScanFace : Fingerprint;

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] bg-background flex flex-col items-center justify-center p-6"
      >
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <img src={logo} alt="Centar" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <div className="flex items-center justify-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground">
              {t('lock.title', 'Aplikacija je zaključana')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('lock.enterPin', 'Unesite PIN za otključavanje')}
          </p>
        </div>

        {/* PIN dots */}
        <motion.div
          animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex gap-3 mb-8"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                i < pin.length
                  ? error
                    ? 'bg-destructive scale-110'
                    : 'bg-primary scale-110'
                  : 'bg-muted-foreground/20'
              }`}
            />
          ))}
        </motion.div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-destructive mb-4"
          >
            {t('lock.wrongPin', 'Pogrešan PIN')}
          </motion.p>
        )}

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 max-w-[260px] w-full">
          {digits.map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="h-16 rounded-2xl bg-muted/50 hover:bg-muted active:bg-muted/80 text-2xl font-semibold text-foreground transition-all active:scale-95"
            >
              {digit}
            </button>
          ))}
          
          {/* Bottom row: biometric, 0, delete */}
          <button
            onClick={() => biometricEnabled && unlockBiometric()}
            className={`h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
              biometricEnabled
                ? 'bg-primary/10 hover:bg-primary/20 text-primary'
                : 'bg-transparent text-transparent cursor-default'
            }`}
            disabled={!biometricEnabled}
          >
            <BiometricIcon className="w-7 h-7" />
          </button>
          
          <button
            onClick={() => handleDigit('0')}
            className="h-16 rounded-2xl bg-muted/50 hover:bg-muted active:bg-muted/80 text-2xl font-semibold text-foreground transition-all active:scale-95"
          >
            0
          </button>
          
          <button
            onClick={handleDelete}
            className="h-16 rounded-2xl bg-muted/50 hover:bg-muted active:bg-muted/80 flex items-center justify-center transition-all active:scale-95"
          >
            <Delete className="w-6 h-6 text-foreground" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
