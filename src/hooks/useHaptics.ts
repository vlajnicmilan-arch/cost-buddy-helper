import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

let HapticsModule: any = null;

const getHaptics = async () => {
  if (!isNative) return null;
  if (HapticsModule) return HapticsModule;
  try {
    const mod = await import('@capacitor/haptics');
    HapticsModule = mod.Haptics;
    return HapticsModule;
  } catch {
    return null;
  }
};

export const useHaptics = () => {
  const lightTap = async () => {
    const h = await getHaptics();
    if (h) {
      try {
        const { ImpactStyle } = await import('@capacitor/haptics');
        await h.impact({ style: ImpactStyle.Light });
      } catch {}
    }
  };

  const mediumTap = async () => {
    const h = await getHaptics();
    if (h) {
      try {
        const { ImpactStyle } = await import('@capacitor/haptics');
        await h.impact({ style: ImpactStyle.Medium });
      } catch {}
    }
  };

  const successVibration = async () => {
    const h = await getHaptics();
    if (h) {
      try {
        const { NotificationType } = await import('@capacitor/haptics');
        await h.notification({ type: NotificationType.Success });
      } catch {}
    }
  };

  const errorVibration = async () => {
    const h = await getHaptics();
    if (h) {
      try {
        const { NotificationType } = await import('@capacitor/haptics');
        await h.notification({ type: NotificationType.Error });
      } catch {}
    }
  };

  return { lightTap, mediumTap, successVibration, errorVibration };
};
