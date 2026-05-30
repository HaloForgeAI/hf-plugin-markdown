import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
