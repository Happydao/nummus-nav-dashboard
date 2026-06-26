import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/nummus-nav-dashboard/",
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
