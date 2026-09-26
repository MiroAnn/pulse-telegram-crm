import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "admin-pages",
  base: "/pulse-telegram-crm/",
  plugins: [react()],
  build: {
    outDir: "../docs",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "admin-pages/index.html"),
        voprosy: resolve(process.cwd(), "admin-pages/voprosy/index.html"),
      },
    },
  },
});
