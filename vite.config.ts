import { defineConfig } from "vite";

// Static SPA. `base: "./"` keeps asset paths relative so the build works on
// any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, S3).
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
