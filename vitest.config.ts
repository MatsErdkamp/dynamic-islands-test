import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@superobjective/editable-core": new URL(
        "./packages/editable-core/src/index.ts",
        import.meta.url,
      ).pathname,
      "@superobjective/cloudflare": new URL(
        "./packages/cloudflare/src/index.ts",
        import.meta.url,
      ).pathname,
      "@superobjective/tanstack-start": new URL(
        "./packages/tanstack-start/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
