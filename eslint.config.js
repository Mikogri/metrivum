import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/.react-router/**",
      "**/storybook-static/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "contracts/generated/**",
      "graphify-out/**",
      "backend/**",
      "apps/api/**",
      "workers/**",
      "tests/**",
      "TestResults/**",
      ".local/**",
      ".claude/**",
      ".serena/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["apps/mobile/metro.config.cjs", "apps/mobile/plugins/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='from'][callee.object.property.name='supabase']",
          message: "Business data comes from the TrainFlow API, never supabase.from().",
        },
      ],
    },
  },
  {
    // Feature modules talk to each other only through their public index.
    files: ["apps/web/app/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^~/modules/[^/]+/.+",
              message: "Import another module through its index (~/modules/<name>), not its internals.",
            },
          ],
        },
      ],
    },
  },
  {
    // A module may use its own internals via relative paths; the rule above targets the ~ alias.
    files: ["apps/web/app/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^~/modules/", message: "shared/ must not depend on feature modules." }] }],
    },
  },
  {
    files: ["packages/ui-web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^~/", message: "ui-web cannot import from the app." },
            { regex: "^@supabase/", message: "ui-web knows nothing about Supabase." },
            { regex: "^@tanstack/react-query", message: "ui-web knows nothing about server state." },
            { regex: "^@trainflow/api-client-web", message: "ui-web knows nothing about the API." },
          ],
        },
      ],
    },
  },
);
