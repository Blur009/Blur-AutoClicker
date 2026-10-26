import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Cargo writes app_lib.dll etc. under src-tauri/target while linking;
      // on Windows that lock makes chokidar crash with EBUSY. tauri dev
      // restarts cargo itself, so vite never needs to watch src-tauri.
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "./index.html",
        overlay: "./overlay.html",
        indicator: "./indicator.html",
        theme: "./theme.html",
      },
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/react")) return "react";
          if (id.includes("node_modules/@tauri-apps")) return "tauri";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
