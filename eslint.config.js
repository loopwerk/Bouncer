import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  stylistic.configs.customize({
    jsx: false,
    quotes: "double",
    semi: true,
    arrowParens: true,
    braceStyle: "1tbs",
    quoteProps: "as-needed",
  }),
  {
    rules: {
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
      eqeqeq: "error",
      "no-useless-return": "error",
      curly: ["error", "all"],
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "@stylistic/operator-linebreak": ["error", "after"],
      "@stylistic/object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],
      "@stylistic/comma-dangle": [
        "error",
        {
          arrays: "always-multiline",
          objects: "always-multiline",
          imports: "always-multiline",
          exports: "always-multiline",
          generics: "always-multiline",
          tuples: "always-multiline",
        },
      ],
    },
  }
);
