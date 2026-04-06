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

const AppLockContext = createContext<AppLockContextType | null>(null);

export const useAppLock = () => {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
};

// Hash PIN for storage
const hashPin = (pin: string): string => {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'pin_' + Math.abs(hash).toString(36);
};

export const AppLockProvider = ({ children }: { children: ReactNode }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lockTimeout, setLockTimeoutState] = useState<LockTimeout>(60);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'face' | 'none'>('none');

  // Initialize from secure storage
  useEffect(() => {
    const init = async () => {
      try {
        const [pinHash, enabled, timeout, bioEnabled] = await Promise.all([
          SecureStorage.get(LOCK_PIN_KEY),
          SecureStorage.get(LOCK_ENABLED_KEY),
          SecureStorage.get(LOCK_TIMEOUT_KEY),
          SecureStorage.get(LOCK_BIOMETRIC_KEY),
        ]);

        const hasPIN = !!pinHash;
        const isEnabled = enabled === 'true';
        setHasPinSet(hasPIN);
        setIsLockEnabled(isEnabled);
        setLockTimeoutState(timeout ? (Number(timeout) as LockTimeout) : 60);
        setBiometricEnabledState(bioEnabled === 'true');

        // Check if should be locked
        if (isEnabled && hasPIN) {
          const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
          const timeoutVal = timeout ? Number(timeout) : 60;
          if (!lastActivity || (Date.now() - Number(lastActivity)) / 1000 > timeoutVal) {
            setIsLocked(true);
          }
        }
      } catch (err) {
        console.error('AppLock init failed:', err);
      }

      // Check biometric availability via native plugin (dynamic)
      if (Capacitor.isNativePlatform()) {
        try {
          const BiometricAuth = (window as any).BiometricAuth;
          if (BiometricAuth?.checkBiometry) {
            const result = await BiometricAuth.checkBiometry();
            if (result?.isAvailable) {
              setBiometricAvailable(true);
              // biometryType: 1=touchId/fingerprint, 2=faceId/face
              setBiometricType(result.biometryType === 2 ? 'face' : 'fingerprint');
            }
          }
        } catch {
          // Plugin not available
        }
      }

      setLoading(false);
    };
    init();
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

  // Visibility change
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

  const unlock = async (pin: string): Promise<boolean> => {
    const storedHash = await SecureStorage.get(LOCK_PIN_KEY);
    if (storedHash && hashPin(pin) === storedHash) {
      setIsLocked(false);
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      return true;
    }
    return false;
  };

  const unlockBiometric = async (): Promise<boolean> => {
    if (!biometricEnabled || !biometricAvailable) return false;

    try {
      if (Capacitor.isNativePlatform()) {
        const BiometricAuth = (window as any).BiometricAuth;
        if (!BiometricAuth) return false;
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
    } catch {
      return false;
    }
    return false;
  };

  const setPin = async (pin: string) => {
    const hashed = hashPin(pin);
    await SecureStorage.set(LOCK_PIN_KEY, hashed);
    // Verify write succeeded
    const readBack = await SecureStorage.get(LOCK_PIN_KEY);
    if (readBack !== hashed) {
      throw new Error('PIN verification failed after save');
    }
    setHasPinSet(true);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  };

  const removePin = async () => {
    await Promise.all([
      SecureStorage.remove(LOCK_PIN_KEY),
      SecureStorage.remove(LOCK_ENABLED_KEY),
      SecureStorage.remove(LOCK_BIOMETRIC_KEY),
    ]);
    setHasPinSet(false);
    setIsLockEnabled(false);
    setBiometricEnabledState(false);
    setIsLocked(false);
  };

  const enableLock = (enabled: boolean) => {
    setIsLockEnabled(enabled);
    SecureStorage.set(LOCK_ENABLED_KEY, String(enabled));
    if (enabled) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }
  };

  const setLockTimeoutFn = (timeout: LockTimeout) => {
    setLockTimeoutState(timeout);
    SecureStorage.set(LOCK_TIMEOUT_KEY, String(timeout));
  };

  const setBiometricEnabled = (enabled: boolean) => {
    setBiometricEnabledState(enabled);
    SecureStorage.set(LOCK_BIOMETRIC_KEY, String(enabled));
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
      biometricAvailable,
      biometricType,
      unlock,
      unlockBiometric,
      setPin,
      removePin,
      enableLock,
      setLockTimeout: setLockTimeoutFn,
      setBiometricEnabled,
      lock,
      loading,
    }}>
      {children}
    </AppLockContext.Provider>
  );
};
