import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { externalsFromManifest } from "../../tooling/externals";

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    sourcemap: true,
    lib: {
      entry: "./src/index.ts",
      formats: ["es", "cjs"],
      fileName: "index",
    },
    rolldownOptions: {
      external: externalsFromManifest(import.meta.url),
    },
  },
});
