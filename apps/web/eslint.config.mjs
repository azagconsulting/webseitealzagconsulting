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
    // Legacy static template/vendor assets and utility scripts.
    "public/**",
    "tools/**",
  ]),
  {
    rules: {
      // Existing codebase contains several intentional occurrences.
      "@typescript-eslint/no-explicit-any": "off",
      // React 19 rule is too strict for current legacy effect patterns.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
