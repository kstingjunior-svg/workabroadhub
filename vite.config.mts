import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 2026-06 main-bundle slim-down.
// Without explicit chunking, every non-lazy import gets glommed into the
// main bundle. The site was shipping a 1,578 KB / 470 KB-gzipped main
// chunk that loaded on EVERY page. manualChunks below splits vendor code
// into cacheable named chunks so first-paint downloads in parallel and
// vendor caches persist across deploys.

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },

  root: path.resolve(__dirname, "client"),

  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/scheduler/")) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/wouter/") ||
              id.includes("/node_modules/react-router")) {
            return "router-vendor";
          }
          if (id.includes("/node_modules/@tanstack/")) {
            return "query-vendor";
          }
          if (id.includes("/node_modules/i18next") ||
              id.includes("/node_modules/react-i18next")) {
            return "i18n-vendor";
          }
          if (id.includes("/node_modules/@supabase/")) {
            return "supabase-vendor";
          }
          if (id.includes("/node_modules/firebase/") ||
              id.includes("/node_modules/@firebase/")) {
            return "firebase-vendor";
          }
          if (id.includes("/node_modules/recharts/") ||
              id.includes("/node_modules/d3-") ||
              id.includes("/node_modules/victory")) {
            return "chart-vendor";
          }
          if (id.includes("/node_modules/leaflet")) {
            return "leaflet-vendor";
          }
          if (id.includes("/node_modules/lucide-react/") ||
              id.includes("/node_modules/@radix-ui/")) {
            return "ui-vendor";
          }
          if (id.includes("/node_modules/zod/") ||
              id.includes("/node_modules/react-hook-form/") ||
              id.includes("/node_modules/@hookform/")) {
            return "form-vendor";
          }
          if (id.includes("/node_modules/framer-motion/")) {
            return "motion-vendor";
          }
          return "vendor";
        },
      },
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
