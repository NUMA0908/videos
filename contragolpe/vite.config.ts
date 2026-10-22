import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: "es2022", outDir: "dist" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
