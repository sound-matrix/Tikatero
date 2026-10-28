import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e", "playwright-report"],
  },
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
});
