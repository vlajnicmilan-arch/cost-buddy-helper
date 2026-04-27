import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

// Module-scoped cache. CRITICAL: never return `HapticsModule` from an async
// function — JavaScript would read `.then` on it during Promise resolution,
// and the Capacitor proxy would throw "Haptics.then() is not implemented".
let HapticsModule: any = null;
let ImpactStyleEnum: any = null;
let NotificationTypeEnum: any = null;
let hapticsAvailable: boolean | null = null;
let loadPromise: Promise<boolean> | null = null;

const isPluginUnavailableError = (e: any): boolean => {
  const msg = String(e?.message ?? e ?? '');
  return (
    msg.includes('not implemented') ||
    msg.includes('not available') ||
    msg.includes('UNIMPLEMENTED') ||
    msg.includes('Haptics.then')
  );
};

/**
 * Load the Haptics module into module-scoped variables.
 * Returns a boolean (never the proxy), so the JS runtime never inspects
 * `.then` on the Capacitor plugin proxy.
 */
const ensureHapticsLoaded = async (): Promise<boolean> => {
  if (!isNative) return false;
  if (hapticsAvailable === false) return false;
  if (HapticsModule && ImpactStyleEnum && NotificationTypeEnum) return true;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const mod = await import('@capacitor/haptics');
      // Assign to module scope. The local references `mod.Haptics`/etc are
      // not returned from this function.
      HapticsModule = mod.Haptics;
      ImpactStyleEnum = mod.ImpactStyle;
      NotificationTypeEnum = mod.NotificationType;
      return true;
    } catch (e) {
      if (isPluginUnavailableError(e)) hapticsAvailable = false;
      return false;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
};

const handleError = (e: any) => {
  if (isPluginUnavailableError(e)) {
    // Permanently disable for this session — avoids spamming the same error
    hapticsAvailable = false;
  }
  // Haptics are non-critical; swallow all errors silently
};

export const useHaptics = () => {
  const lightTap = async () => {
    if (!(await ensureHapticsLoaded())) return;
    try {
      await HapticsModule.impact({ style: ImpactStyleEnum.Light });
    } catch (e) {
      handleError(e);
    }
  };

  const mediumTap = async () => {
    if (!(await ensureHapticsLoaded())) return;
    try {
      await HapticsModule.impact({ style: ImpactStyleEnum.Medium });
    } catch (e) {
      handleError(e);
    }
  };

  const successVibration = async () => {
    if (!(await ensureHapticsLoaded())) return;
    try {
      await HapticsModule.notification({ type: NotificationTypeEnum.Success });
    } catch (e) {
      handleError(e);
    }
  };

  const errorVibration = async () => {
    if (!(await ensureHapticsLoaded())) return;
    try {
      await HapticsModule.notification({ type: NotificationTypeEnum.Error });
    } catch (e) {
      handleError(e);
    }
  };

  return { lightTap, mediumTap, successVibration, errorVibration };
};
