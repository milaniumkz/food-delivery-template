import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      ".generated/**",
      "apps/api/src/payments/*.mjs",
      "apps/api/test/payments.test.mjs",
      "apps/admin/next-env.d.ts",
      "design/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
