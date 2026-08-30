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

// Commit SHA of the build, injected by CI/hosting when available.
const commitSha =
  process.env.COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  // No VCS SHA in the hosting build env — fall back to a build timestamp so the
  // marker still changes on every publish and stays verifiable with one curl.
  `dev-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __COMMIT_SHA__: JSON.stringify(commitSha),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    // Inject the build's commit SHA into index.html so a published build can be
    // verified with a single curl, without grepping hashed chunks.
    {
      name: "inject-build-sha",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: { name: "build-sha", content: commitSha },
            injectTo: "head" as const,
          },
        ];
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
          // Vite's dynamic-import preload helper is imported by the entry.
          // Left unassigned, Rollup parks it inside whichever shared chunk it
          // likes (it landed in `jspdf`), which dragged 422 KB of PDF code onto
          // the landing page's critical path. Pin it to react-vendor, which the
          // entry loads anyway.
          if (id.includes("vite/preload-helper")) return "react-vendor";
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
