import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 8000 },
  server: { port: 5173 },
  test: { environment: "node" },
} as Parameters<typeof defineConfig>[0]);
