import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.costbuddy',
  appName: 'V&M Balance',
  webDir: 'dist',
  server: {
    url: 'https://cost-buddy-helper.lovable.app?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
