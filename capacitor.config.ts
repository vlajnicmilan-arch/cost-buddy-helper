import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.costbuddy',
  appName: 'V&M Balance',
  webDir: 'dist',
  server: {
    url: 'https://vmbalance.com/app?forceHideBadge=true',
    cleartext: true,
    allowNavigation: ['vmbalance.com', 'www.vmbalance.com', 'cost-buddy-helper.lovable.app', 'accounts.google.com', 'appleid.apple.com'],
  },
  plugins: {
    SplashScreen: {
      // Keep splash short and let JS hide it explicitly once React mounts.
      // launchAutoHide=false + manual hide() prevents the "ghost overlay"
      // bug where the splash stays as a transparent layer blocking taps
      // on certain Android WebView versions.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0f172a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
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
