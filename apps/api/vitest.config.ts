import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "node_modules"],
    },
  },
  resolve: {
    alias: {
      "@tpt-court/database": path.resolve(__dirname, "../../packages/database/src"),
      "@tpt-court/types": path.resolve(__dirname, "../../packages/types/src"),
    },
  },
});