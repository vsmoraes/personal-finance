import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
import sort from "eslint-plugin-simple-import-sort";
export default ts.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "apps/web/dist/**",
      "packages/contracts/src/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["apps/api/src/**/*.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  ...ts.configs.recommendedTypeChecked,
  {
    files: ["apps/api/src/**/*.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": hooks,
      "jsx-a11y": a11y,
      "simple-import-sort": sort,
    },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
    },
  },
  { files: ["**/*.mjs"], extends: [ts.configs.disableTypeChecked] },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/database/**",
            "**/application/**",
            "fastify",
            "drizzle-orm",
            "node:*",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/database/**",
            "**/apps/**",
            "fastify",
            "drizzle-orm",
            "node:*",
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "**/database/**",
            "**/application/**",
            "**/api/**",
            "node:*",
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/vite.config.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
