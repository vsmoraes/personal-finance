import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/healthz": "http://127.0.0.1:8080",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("recharts") ||
              id.includes("d3-") ||
              id.includes("victory-vendor")
            )
              return "charts";
            if (id.includes("@bufbuild")) return "protobuf";
            if (
              id.includes("/antd/") ||
              id.includes("/rc-") ||
              id.includes("@ant-design") ||
              id.includes("@rc-component")
            )
              return "design-system";
            return "vendor";
          }
        },
      },
    },
  },
});
