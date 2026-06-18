import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Payment source canonical-model guard.
// Blocks `.insert|.update|.upsert({ payment_source: ... })` outside the
// central CRUD chokepoint (useExpenseCRUD.ts). Background:
// Foundation Plan Val 1–3 — `expenses.payment_source` writes MUST go through
// `normalizePaymentSource` so the value is guaranteed canonical
// (`custom:UUID` or built-in slug). Direct writes can silently re-introduce
// raw UUIDs and bypass the DB CHECK constraint via a stale client path.
const paymentSourceGuard = {
  selector:
    "CallExpression[callee.object.callee.property.name='from'][callee.object.arguments.0.value='expenses'][callee.property.name=/^(insert|update|upsert)$/] Property[key.name='payment_source']",
  message:
    "Direct writes to `expenses.payment_source` are forbidden outside `src/hooks/useExpenseCRUD.ts`. Use `normalizePaymentSource` or `coerceCanonicalShape` from `@/lib/paymentSource/normalize` and route writes through the CRUD chokepoint.",
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-syntax": ["error", paymentSourceGuard],
    },
  },
  {
    // Chokepoint: useExpenseCRUD owns the normalization contract.
    files: ["src/hooks/useExpenseCRUD.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
);
