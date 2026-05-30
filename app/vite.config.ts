import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "hf-third-party-notices",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "THIRD_PARTY_NOTICES.md",
          source: readFileSync(resolve(appRoot, "../THIRD_PARTY_NOTICES.md"), "utf8"),
        });
      },
    },
  ],
  build: {
    commonjsOptions: {
      include: [/node_modules/, /vendor\/vditor\/dist\/index\.js/],
    },
    lib: {
      entry: "index.tsx",
      formats: ["iife"],
      name: "hfpluginmarkdownFrontend",
      fileName: () => "index.js",
      cssFileName: "styles",
    },
    outDir: "dist",
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        strict: false,
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
      },
    },
  },
});
