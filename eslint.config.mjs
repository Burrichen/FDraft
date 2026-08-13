import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated at build time by `serwist build` — see serwist.config.mjs.
    "public/sw.js",
    // Rust build artifacts (including generated JS glue code) — not source.
    "src-tauri/target/**",
  ]),
]);

export default eslintConfig;
