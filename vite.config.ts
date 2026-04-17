import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// Read version from version.json
const versionData = JSON.parse(fs.readFileSync('./public/version.json', 'utf-8'));
const appVersion = versionData.version;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Always stub the PWA register hook — we no longer ship a service worker.
      // /sw.js is now a self-destructing no-op kept only to remove the legacy
      // PWA cache that was breaking the Capacitor APK on /setup.
      "virtual:pwa-register/react": path.resolve(__dirname, "./src/lib/pwa-register-stub.ts"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
