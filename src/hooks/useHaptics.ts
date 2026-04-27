import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

let HapticsModule: any = null;
let ImpactStyleEnum: any = null;
let NotificationTypeEnum: any = null;
let hapticsAvailable: boolean | null = null;

const isPluginUnavailableError = (e: any): boolean => {
  const msg = String(e?.message ?? e ?? '');
  return (
    msg.includes('not implemented') ||
    msg.includes('not available') ||
    msg.includes('UNIMPLEMENTED') ||
    msg.includes('Haptics.then')
  );
};

const getHaptics = async () => {
  if (!isNative) return null;
  if (hapticsAvailable === false) return null;
  if (HapticsModule) return HapticsModule;
  try {
    const mod = await import('@capacitor/haptics');
    HapticsModule = mod.Haptics;
    ImpactStyleEnum = mod.ImpactStyle;
    NotificationTypeEnum = mod.NotificationType;
    return HapticsModule;
  } catch (e) {
    if (isPluginUnavailableError(e)) {
      hapticsAvailable = false;
    }
    return null;
  }
};

/**
 * Wraps the entire haptics call (including module access) in a try/catch.
 * Permanently disables haptics for the session if the native plugin is not
 * registered (avoids spamming "Haptics.then() is not implemented" on Android
 * builds where the plugin is missing from the native bridge).
 */
const safeRun = async (fn: () => Promise<void>) => {
  if (!isNative || hapticsAvailable === false) return;
  try {
    await fn();
  } catch (e: any) {
    if (isPluginUnavailableError(e)) {
      hapticsAvailable = false;
    }
    // All errors are silent — haptics are non-critical
  }
};

export const useHaptics = () => {
  const lightTap = async () => {
    await safeRun(async () => {
      const h = await getHaptics();
      if (!h || !ImpactStyleEnum) return;
      await h.impact({ style: ImpactStyleEnum.Light });
    });
  };

  const mediumTap = async () => {
    await safeRun(async () => {
      const h = await getHaptics();
      if (!h || !ImpactStyleEnum) return;
      await h.impact({ style: ImpactStyleEnum.Medium });
    });
  };

  const successVibration = async () => {
    await safeRun(async () => {
      const h = await getHaptics();
      if (!h || !NotificationTypeEnum) return;
      await h.notification({ type: NotificationTypeEnum.Success });
    });
  };

  const errorVibration = async () => {
    await safeRun(async () => {
      const h = await getHaptics();
      if (!h || !NotificationTypeEnum) return;
      await h.notification({ type: NotificationTypeEnum.Error });
    });
  };

  return { lightTap, mediumTap, successVibration, errorVibration };
};
