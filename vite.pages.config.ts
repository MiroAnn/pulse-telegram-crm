import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "admin-pages",
  base: "/pulse-telegram-crm/",
  plugins: [react()],
  build: { outDir: "../docs", emptyOutDir: true },
});
