import { useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

interface UseNativeCameraReturn {
  takePhoto: () => Promise<string | null>;
  pickFromGallery: () => Promise<string | null>;
  isNative: boolean;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  galleryInputRef: React.RefObject<HTMLInputElement>;
}

const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const useNativeCamera = (): UseNativeCameraReturn => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const isNative = isNativePlatform();

  const takeNativePhoto = useCallback(async (source: CameraSource): Promise<string | null> => {
    try {
      const image = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source,
        width: 1200,
        correctOrientation: true,
      });

      if (image.base64String) {
        const mimeType = image.format === 'png' ? 'image/png' : 'image/jpeg';
        return `data:${mimeType};base64,${image.base64String}`;
      }
      return null;
    } catch (error: any) {
      // User cancelled
      if (error?.message?.includes('User cancelled') || error?.message?.includes('cancelled')) {
        return null;
      }
      console.error('Native camera error:', error);
      return null;
    }
  }, []);

  const takePhoto = useCallback(async (): Promise<string | null> => {
    if (isNative) {
      return takeNativePhoto(CameraSource.Camera);
    }
    // Web fallback: trigger file input
    return new Promise((resolve) => {
      const input = cameraInputRef.current;
      if (!input) { resolve(null); return; }
      
      const handler = async (e: Event) => {
        input.removeEventListener('change', handler);
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const base64 = await readFileAsBase64(file);
        input.value = '';
        resolve(base64);
      };
      input.addEventListener('change', handler);
      input.click();
    });
  }, [isNative, takeNativePhoto]);

  const pickFromGallery = useCallback(async (): Promise<string | null> => {
    if (isNative) {
      return takeNativePhoto(CameraSource.Photos);
    }
    // Web fallback: trigger gallery input
    return new Promise((resolve) => {
      const input = galleryInputRef.current;
      if (!input) { resolve(null); return; }
      
      const handler = async (e: Event) => {
        input.removeEventListener('change', handler);
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const base64 = await readFileAsBase64(file);
        input.value = '';
        resolve(base64);
      };
      input.addEventListener('change', handler);
      input.click();
    });
  }, [isNative, takeNativePhoto]);

  return {
    takePhoto,
    pickFromGallery,
    isNative,
    cameraInputRef,
    galleryInputRef,
  };
};
