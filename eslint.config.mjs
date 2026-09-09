import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      // These pages intentionally load on-chain state on mount. Treat the new
      // React 19 advisory as a warning while keeping the rest of the Next.js
      // and TypeScript lint rules active.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  { files: ["lib/**/*.cjs", "src/lib/hofHorses.js", "web-test/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    "deploy/**",
    ".github/deploy/**",
    "test/**",
    "hardhat.config.js",
  ]),
]);
