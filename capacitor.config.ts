import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.costbuddy',
  appName: 'V&M Balance',
  webDir: 'dist',
  // ⚠️ DEVELOPMENT ONLY: Remote URL za hot-reload tijekom razvoja.
  // Za PRODUKCIJSKI APK build: obriši ili zakomentiraj cijeli "server" blok,
  // zatim pokreni: npm run build → npx cap sync → build u Android Studiju.
  // Bez ovog bloka, Capacitor učitava lokalne datoteke iz dist/ foldera.
  server: {
    url: 'https://8a8fc612-0ac2-4902-a82e-29b5b800bc32.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
