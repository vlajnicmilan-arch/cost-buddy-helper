import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.costbuddy',
  appName: 'V&M Balance',
  webDir: 'dist',
  server: {
    url: 'https://vmbalance.com?forceHideBadge=true',
    cleartext: true,
    allowNavigation: ['vmbalance.com', 'www.vmbalance.com', 'cost-buddy-helper.lovable.app', 'accounts.google.com', 'appleid.apple.com'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: true,
      spinnerColor: '#3b82f6',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    Camera: {
      presentationStyle: 'fullscreen',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
