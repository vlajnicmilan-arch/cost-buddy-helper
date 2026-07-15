import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRecentExpenses from "./tools/list-recent-expenses";
import getWalletBalances from "./tools/get-wallet-balances";
import createExpense from "./tools/create-expense";
import listBudgets from "./tools/list-budgets";
import getBudgetDetails from "./tools/get-budget-details";
import createBudget from "./tools/create-budget";
import addBudgetCategory from "./tools/add-budget-category";
import listProjects from "./tools/list-projects";
import getProjectDetails from "./tools/get-project-details";
import listProjectMilestones from "./tools/list-project-milestones";
import createProject from "./tools/create-project";
import listProjectWorkEntries from "./tools/list-project-work-entries";
import listKrugs from "./tools/list-krugs";
import getKrugSummary from "./tools/get-krug-summary";
import listKrugExpenses from "./tools/list-krug-expenses";

// Build the OAuth issuer from the Supabase project ref at build time. Never
// derive it from SUPABASE_URL — on Lovable Cloud that is the .lovable.cloud
// proxy, and mcp-js rejects tokens whose issuer doesn't match the discovery
// document (RFC 8414 §3.3). The fallback keeps the entry import-safe during
// the throwaway manifest-extract eval.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "vm-balance-mcp",
  title: "Centar MCP",
  version: "0.2.0",
  instructions:
    "Tools for Centar, a personal & small-business finance app. Domains: (1) Transactions — list_recent_expenses, get_wallet_balances, create_expense. (2) Budgets — list_budgets, get_budget_details, create_budget, add_budget_category. (3) Projects — list_projects, get_project_details, list_project_milestones, create_project, list_project_work_entries. (4) Krug (shared/family circles) — list_krugs, get_krug_summary, list_krug_expenses. All tools run as the signed-in user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listRecentExpenses,
    getWalletBalances,
    createExpense,
    listBudgets,
    getBudgetDetails,
    createBudget,
    addBudgetCategory,
    listProjects,
    getProjectDetails,
    listProjectMilestones,
    createProject,
    listProjectWorkEntries,
    listKrugs,
    getKrugSummary,
    listKrugExpenses,
  ],
});
