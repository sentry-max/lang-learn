import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: typescriptParser },
    plugins: { "@typescript-eslint": typescriptPlugin, "react-hooks": reactHooksPlugin },
    // tsc already reports types and unused names; the rule set is kept to what it can't see.
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-debugger": "error",
      eqeqeq: "error",
    },
  },
];
