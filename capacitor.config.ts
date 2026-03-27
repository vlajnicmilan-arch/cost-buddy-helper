import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.costbuddy',
  appName: 'V&M Balance',
  webDir: 'dist',
  server: {
    url: 'https://8a8fc612-0ac2-4902-a82e-29b5b800bc32.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
