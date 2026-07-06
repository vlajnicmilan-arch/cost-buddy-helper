import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRecentExpenses from "./tools/list-recent-expenses";
import getWalletBalances from "./tools/get-wallet-balances";
import createExpense from "./tools/create-expense";

// Build the OAuth issuer from the Supabase project ref at build time. Never
// derive it from SUPABASE_URL — on Lovable Cloud that is the .lovable.cloud
// proxy, and mcp-js rejects tokens whose issuer doesn't match the discovery
// document (RFC 8414 §3.3). The fallback keeps the entry import-safe during
// the throwaway manifest-extract eval.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vm-balance-mcp",
  title: "V&M Balance MCP",
  version: "0.1.0",
  instructions:
    "Tools for V&M Balance, a personal & small-business finance app. Use `list_recent_expenses` to fetch the signed-in user's recent transactions, `get_wallet_balances` to see their payment sources, and `create_expense` to record a new expense.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listRecentExpenses, getWalletBalances, createExpense],
});
