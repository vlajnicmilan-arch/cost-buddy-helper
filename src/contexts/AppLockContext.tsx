import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { SecureStorage } from '@/lib/secureStorage';
import { Capacitor } from '@capacitor/core';

const LOCK_PIN_KEY = 'app_lock_pin';
const LOCK_ENABLED_KEY = 'app_lock_enabled';
const LOCK_TIMEOUT_KEY = 'app_lock_timeout';
const LOCK_BIOMETRIC_KEY = 'app_lock_biometric';
const LAST_ACTIVITY_KEY = 'app_last_activity';

export type LockTimeout = 0 | 30 | 60 | 120 | 300;

interface AppLockContextType {
  isLocked: boolean;
  isLockEnabled: boolean;
  hasPinSet: boolean;
  lockTimeout: LockTimeout;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  biometricType: 'fingerprint' | 'face' | 'none';
  unlock: (pin: string) => Promise<boolean>;
  unlockBiometric: () => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  enableLock: (enabled: boolean) => void;
  setLockTimeout: (timeout: LockTimeout) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  lock: () => void;
  loading: boolean;
}

export const AppLockProvider = ({ children }: { children: ReactNode }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(() => localStorage.getItem(LOCK_ENABLED_KEY) === 'true');
  const [hasPinSet, setHasPinSet] = useState(() => !!localStorage.getItem(LOCK_PIN_KEY));
  const [lockTimeout, setLockTimeoutState] = useState<LockTimeout>(() => {
    const saved = localStorage.getItem(LOCK_TIMEOUT_KEY);
    return saved ? (Number(saved) as LockTimeout) : 60;
  });
  const [biometricEnabled, setBiometricEnabledState] = useState(() => localStorage.getItem(LOCK_BIOMETRIC_KEY) === 'true');

  // Check lock on mount
  useEffect(() => {
    if (!isLockEnabled || !hasPinSet) return;

    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivity) {
      setIsLocked(true);
      return;
    }

    const elapsed = (Date.now() - Number(lastActivity)) / 1000;
    if (elapsed > lockTimeout) {
      setIsLocked(true);
    }
  }, []);

  // Track activity
  const updateActivity = useCallback(() => {
    if (isLockEnabled && hasPinSet && !isLocked) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }
  }, [isLockEnabled, hasPinSet, isLocked]);

  useEffect(() => {
    if (!isLockEnabled || !hasPinSet) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));

    const interval = setInterval(() => {
      if (isLocked) return;
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) return;
      const elapsed = (Date.now() - Number(lastActivity)) / 1000;
      if (elapsed > lockTimeout) {
        setIsLocked(true);
      }
    }, 5000);

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity));
      clearInterval(interval);
    };
  }, [isLockEnabled, hasPinSet, isLocked, lockTimeout, updateActivity]);

  // Visibility change — lock when app goes to background
  useEffect(() => {
    if (!isLockEnabled || !hasPinSet) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      } else if (document.visibilityState === 'visible') {
        const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (lastActivity) {
          const elapsed = (Date.now() - Number(lastActivity)) / 1000;
          if (elapsed > lockTimeout) {
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isLockEnabled, hasPinSet, lockTimeout]);

  const unlock = (pin: string): boolean => {
    const storedHash = localStorage.getItem(LOCK_PIN_KEY);
    if (storedHash && hashPin(pin) === storedHash) {
      setIsLocked(false);
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      return true;
    }
    return false;
  };

  const unlockBiometric = async (): Promise<boolean> => {
    if (!biometricEnabled) return false;

    try {
      if ((window as any).Capacitor?.isNativePlatform?.()) {
        // Biometric plugin must be registered globally in native builds
        const BiometricAuth = (window as any).BiometricAuth;
        if (BiometricAuth) {
          await BiometricAuth.authenticate({
            reason: 'Otključajte V&M Balance',
            title: 'Biometrijska provjera',
            subtitle: 'Koristite otisak prsta ili prepoznavanje lica',
            negativeButtonText: 'Koristi PIN',
          });
          setIsLocked(false);
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  };

  const setPin = (pin: string) => {
    localStorage.setItem(LOCK_PIN_KEY, hashPin(pin));
    setHasPinSet(true);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  };

  const removePin = () => {
    localStorage.removeItem(LOCK_PIN_KEY);
    localStorage.removeItem(LOCK_ENABLED_KEY);
    localStorage.removeItem(LOCK_BIOMETRIC_KEY);
    setHasPinSet(false);
    setIsLockEnabled(false);
    setBiometricEnabledState(false);
    setIsLocked(false);
  };

  const enableLock = (enabled: boolean) => {
    setIsLockEnabled(enabled);
    localStorage.setItem(LOCK_ENABLED_KEY, String(enabled));
    if (enabled) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }
  };

  const setLockTimeoutFn = (timeout: LockTimeout) => {
    setLockTimeoutState(timeout);
    localStorage.setItem(LOCK_TIMEOUT_KEY, String(timeout));
  };

  const setBiometricEnabled = (enabled: boolean) => {
    setBiometricEnabledState(enabled);
    localStorage.setItem(LOCK_BIOMETRIC_KEY, String(enabled));
  };

  const lock = () => {
    if (isLockEnabled && hasPinSet) {
      setIsLocked(true);
    }
  };

  return (
    <AppLockContext.Provider value={{
      isLocked,
      isLockEnabled,
      hasPinSet,
      lockTimeout,
      biometricEnabled,
      unlock,
      unlockBiometric,
      setPin,
      removePin,
      enableLock,
      setLockTimeout: setLockTimeoutFn,
      setBiometricEnabled,
      lock,
    }}>
      {children}
    </AppLockContext.Provider>
  );
};
