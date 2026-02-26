import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/commiq/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/v1/traces": {
        target: "http://localhost:4318",
        changeOrigin: true,
      },
    },
  },
});
