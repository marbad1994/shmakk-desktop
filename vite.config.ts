import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import electronRenderer from "vite-plugin-electron-renderer";
import path from "node:path";
import { builtinModules } from "node:module";

const electronExternals = [
  "electron",
  "sqlite",
  "node:sqlite",
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
];

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "src/electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            target: "node22",
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
      },
      {
        entry: "src/electron/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            target: "node22",
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
  },
});
