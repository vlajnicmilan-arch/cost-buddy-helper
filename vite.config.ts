import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
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
    // Serve static landing at /centar (and /centar/) before Vite's SPA fallback
    // rewrites the HTML. Only affects dev/preview — production hosting is
    // file-first and doesn't need this.
    {
      name: "serve-static-centar",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/centar" || req.url === "/centar/") {
            req.url = "/centar/index.html";
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/centar" || req.url === "/centar/") {
            req.url = "/centar/index.html";
          }
          next();
        });
      },
    },
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
    // Bundle analyzer — generates dist/stats.html after `vite build`.
    // Only runs when ANALYZE=true to avoid slowing down normal builds.
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          // Heavy, route-specific deps — split into own chunks so they
          // load only when a page that imports them is visited.
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) return "jspdf";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("xlsx")) return "xlsx";
          // Stable vendor chunks for better long-term caching.
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack")) return "tanstack";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          )
            return "react-vendor";
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}));
