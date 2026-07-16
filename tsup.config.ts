import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/desktop/main.ts",
    preload: "src/desktop/preload.ts"
  },
  outDir: "dist-electron",
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node20",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["electron"]
});
