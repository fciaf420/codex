import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We ship our own service worker (handles Web Share Target), so use
      // injectManifest. We don't actually need workbox precaching — the SW
      // does its own cache-first — so the injection point is disabled below.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      injectManifest: {
        injectionPoint: undefined,
      },
      includeAssets: ["icons/*"],
      manifest: {
        name: "Codex Mobile",
        short_name: "Codex",
        description: "Mobile client for the Codex CLI bridge.",
        theme_color: "#0b0f17",
        background_color: "#0b0f17",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            files: [
              {
                name: "files",
                accept: ["image/*", "text/plain"],
              },
            ],
          },
        },
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
