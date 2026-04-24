import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

let HapticsModule: any = null;
let hapticsAvailable: boolean | null = null;

const getHaptics = async () => {
  if (!isNative) return null;
  if (hapticsAvailable === false) return null;
  if (HapticsModule) return HapticsModule;
  try {
    const mod = await import('@capacitor/haptics');
    HapticsModule = mod.Haptics;
    return HapticsModule;
  } catch {
    hapticsAvailable = false;
    return null;
  }
};

const isPluginUnavailableError = (e: any): boolean => {
  const msg = String(e?.message ?? e ?? '');
  return (
    msg.includes('not implemented') ||
    msg.includes('not available') ||
    msg.includes('UNIMPLEMENTED')
  );
};

const safeCall = async (fn: () => Promise<void>) => {
  if (hapticsAvailable === false) return;
  try {
    await fn();
  } catch (e: any) {
    if (isPluginUnavailableError(e)) {
      // Soft-disable for the rest of the session — plugin not registered natively
      hapticsAvailable = false;
      return;
    }
    // Other errors are silent — haptics are non-critical
  }
};

export const useHaptics = () => {
  const lightTap = async () => {
    const h = await getHaptics();
    if (!h) return;
    await safeCall(async () => {
      const { ImpactStyle } = await import('@capacitor/haptics');
      await h.impact({ style: ImpactStyle.Light });
    });
  };

  const mediumTap = async () => {
    const h = await getHaptics();
    if (!h) return;
    await safeCall(async () => {
      const { ImpactStyle } = await import('@capacitor/haptics');
      await h.impact({ style: ImpactStyle.Medium });
    });
  };

  const successVibration = async () => {
    const h = await getHaptics();
    if (!h) return;
    await safeCall(async () => {
      const { NotificationType } = await import('@capacitor/haptics');
      await h.notification({ type: NotificationType.Success });
    });
  };

  const errorVibration = async () => {
    const h = await getHaptics();
    if (!h) return;
    await safeCall(async () => {
      const { NotificationType } = await import('@capacitor/haptics');
      await h.notification({ type: NotificationType.Error });
    });
  };

  return { lightTap, mediumTap, successVibration, errorVibration };
};
