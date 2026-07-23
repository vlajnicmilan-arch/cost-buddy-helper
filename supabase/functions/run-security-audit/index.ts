// TEMPORARY AUDIT TOOL — delete after verdict
//
// Adversarial security audit as a Supabase Edge Function.
//
// LOCK 1: verify_jwt = true + hard-check auth.uid() === MILAN_UID (Milan only).
// LOCK 2: synthetic security+a/@ / security+b@ users only; try/finally teardown;
//         COUNT-parity of LIVE tables before/after (idempotent, no live rows touched).
// LOCK 3: one-shot tool — remove file + config.toml block after Milan confirms verdict.
//
// Invocation:
//   supabase.functions.invoke('run-security-audit', { body: { part: 1 } })
// Split into parts (1..3) if 150s runtime is tight. `part=0` runs all.
//
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MILAN_UID = 'd4d31ee6-5f6b-4059-8c87-b595b394f56b';
const SEC_A_EMAIL = 'security+a@vmbalance.com';
const SEC_B_EMAIL = 'security+b@vmbalance.com';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const LIVE_TABLES = [
  'projects', 'expenses', 'custom_payment_sources', 'user_entitlements',
  'krug', 'krug_membership', 'project_members', 'project_milestones',
  'project_worker_payouts', 'imported_statements',
];

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type Verdict = { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; severity?: Severity; surface?: string; role?: string; note?: string };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureSecUser(email: string, password: string): Promise<string> {
  const a = admin();
  let userId: string | null = null;
  let page = 1;
  while (page <= 30) {
    const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) { userId = found.id; break; }
    if (data.users.length < 200) break;
    page++;
  }
  if (!userId) {
    const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
  } else {
    await a.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }
  await a.from('profiles').upsert(
    { user_id: userId, is_e2e_user: true, onboarding_completed: true },
    { onConflict: 'user_id' },
  );
  return userId;
}

async function signIn(email: string, password: string): Promise<{ client: SupabaseClient; token: string; userId: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message ?? 'no session'}`);
  return { client, token: data.session.access_token, userId: data.user!.id };
}

async function snapshot(): Promise<Record<string, number>> {
  const a = admin();
  const out: Record<string, number> = {};
  for (const t of LIVE_TABLES) {
    const { count, error } = await a.from(t).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${t}: ${error.message}`);
    out[t] = count ?? 0;
  }
  return out;
}

// Test helper: creates a Verdict from an assertion
function verdict(name: string, ok: boolean, opts: { severity?: Severity; surface?: string; role?: string; failNote?: string; passNote?: string } = {}): Verdict {
  if (ok) return { name, status: 'PASS', note: opts.passNote };
  return { name, status: 'FAIL', severity: opts.severity ?? 'HIGH', surface: opts.surface, role: opts.role, note: opts.failNote };
}

async function edgeFn(name: string, body: unknown, token: string | null): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST', headers, body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, text };
}

// -------- Fixtures (ALL setup via service-role admin — bypasses RLS on purpose) ----------
// Adversarial assertions still use anon+JWT clients (ctx.aClient/bClient). Setup ≠ test.
async function createProject(ownerId: string): Promise<string> {
  const { data, error } = await admin().from('projects')
    .insert({ user_id: ownerId, name: `sec-proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'active' })
    .select('id').single();
  if (error) throw new Error(`createProject: ${error.message}`);
  return data.id;
}
async function createExpense(ownerId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin().from('expenses').insert({
    user_id: ownerId, amount: 42, description: 'sec-fixture', category: 'sec', type: 'expense',
    date: new Date().toISOString().slice(0, 10), ...overrides,
  }).select('id').single();
  if (error) throw new Error(`createExpense: ${error.message}`);
  return data.id;
}
async function createCustomSource(ownerId: string): Promise<string> {
  const { data, error } = await admin().from('custom_payment_sources')
    // NOTE: table has no `type` column; icon+color are NOT NULL.
    .insert({ user_id: ownerId, name: 'sec-source', icon: 'wallet', color: '#000000', currency: 'EUR' })
    .select('id').single();
  if (error) throw new Error(`createCustomSource: ${error.message}`);
  return data.id;
}
async function createMilestone(projectId: string, budget = 100): Promise<string> {
  // NOTE: real column is `budget` (NOT `total_budget`). No user_id column.
  const { data, error } = await admin().from('project_milestones')
    .insert({ project_id: projectId, name: `ms-${Math.random().toString(36).slice(2, 6)}`, budget })
    .select('id').single();
  if (error) throw new Error(`createMilestone: ${error.message}`);
  return data.id;
}
async function createIncomeSource(ownerId: string): Promise<string> {
  const { data, error } = await admin().from('income_sources')
    .insert({ user_id: ownerId, name: 'sec-inc' })
    .select('id').single();
  if (error) throw new Error(`createIncomeSource: ${error.message}`);
  return data.id;
}
async function createFunding(projectId: string, incomeSourceId: string, amount = 10000): Promise<string> {
  const { data, error } = await admin().from('project_funding')
    .insert({ project_id: projectId, income_source_id: incomeSourceId, allocated_amount: amount })
    .select('id').single();
  if (error) throw new Error(`createFunding: ${error.message}`);
  return data.id;
}
async function addProjectMember(projectId: string, userId: string, role: string): Promise<string> {
  const { data, error } = await admin().from('project_members')
    .insert({ project_id: projectId, user_id: userId, role })
    .select('id').single();
  if (error) throw new Error(`addProjectMember(${role}): ${error.message}`);
  return data.id;
}
async function createKrug(ownerId: string, name = 'sec-krug'): Promise<string> {
  // Real schema: krug has no owner_id — ownership lives in krug_ownership; membership in krug_membership.
  const { data, error } = await admin().from('krug')
    .insert({ name, preset: 'projekt', lifecycle_state: 'active', created_by: ownerId })
    .select('id').single();
  if (error) throw new Error(`createKrug: ${error.message}`);
  const krugId = data.id;
  const own = await admin().from('krug_ownership').insert({ krug_id: krugId, user_id: ownerId });
  if (own.error) throw new Error(`krug_ownership: ${own.error.message}`);
  const mem = await admin().from('krug_membership').insert({ krug_id: krugId, user_id: ownerId, role: 'punopravni' });
  if (mem.error) throw new Error(`krug_membership(owner): ${mem.error.message}`);
  return krugId;
}


// -------- Spec runners ----------
type Ctx = {
  aId: string; bId: string;
  aClient: SupabaseClient; bClient: SupabaseClient;
  aToken: string; bToken: string;
};

async function spec01_crossUserReads(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  const projectAId = await createProject(ctx.aId);
  const sourceAId = await createCustomSource(ctx.aId);
  const expenseAId = await createExpense(ctx.aId, { project_id: projectAId, payment_source: `custom:${sourceAId}` });
  try {
    let r;
    r = await ctx.bClient.from('projects').select('id').eq('id', projectAId);
    results.push(verdict('01.1 B ne vidi A-in projekt', !r.error && (r.data ?? []).length === 0, { severity: 'CRITICAL', surface: 'projects', role: 'other-user' }));

    r = await ctx.bClient.from('expenses').select('id').eq('project_id', projectAId);
    results.push(verdict('01.2 B ne vidi A-ine expenses po project_id', !r.error && (r.data ?? []).length === 0, { severity: 'CRITICAL', surface: 'expenses' }));

    r = await ctx.bClient.from('expenses').select('id').eq('id', expenseAId);
    results.push(verdict('01.3 B ne vidi A-in expense po id', !r.error && (r.data ?? []).length === 0, { severity: 'CRITICAL', surface: 'expenses' }));

    r = await ctx.bClient.from('custom_payment_sources').select('id').eq('id', sourceAId);
    results.push(verdict('01.4 B ne vidi A-in custom_payment_source', !r.error && (r.data ?? []).length === 0, { severity: 'CRITICAL', surface: 'custom_payment_sources' }));

    r = await ctx.bClient.from('imported_statements').select('id').eq('user_id', ctx.aId);
    results.push(verdict('01.5 B ne vidi A-ine imported_statements', !r.error && (r.data ?? []).length === 0, { severity: 'HIGH', surface: 'imported_statements' }));

    r = await ctx.bClient.from('user_entitlements').select('id').eq('user_id', ctx.aId);
    results.push(verdict('01.6 B ne vidi A-ine user_entitlements', !r.error && (r.data ?? []).length === 0, { severity: 'HIGH', surface: 'user_entitlements' }));

    r = await ctx.bClient.from('profiles').select('email').eq('user_id', ctx.aId);
    const emailLeaked = (r.data ?? []).some((row: any) => row.email && row.email !== '');
    results.push(verdict('01.7 B ne vidi A-in email preko profiles', !r.error && !emailLeaked, { severity: 'HIGH', surface: 'profiles.email' }));
  } finally {
    const a = admin();
    await a.from('expenses').delete().eq('user_id', ctx.aId);
    await a.from('custom_payment_sources').delete().eq('user_id', ctx.aId);
    await a.from('projects').delete().eq('user_id', ctx.aId);
  }
  return results;
}

async function spec02_roleWrites(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  const projectId = await createProject(ctx.aId);
  const incomeSourceAId = await createIncomeSource(ctx.aId);
  try {
    for (const role of ['worker', 'investor'] as const) {
      await admin().from('project_members').delete().eq('project_id', projectId);
      await addProjectMember(projectId, ctx.bId, role);

      // NOTE: project_milestones has no user_id column; real budget column is `budget`.
      let r: any = await ctx.bClient.from('project_milestones')
        .insert({ project_id: projectId, name: 'evil', budget: 999 });
      results.push(verdict(`02.${role}.1 ${role} ne INSERT milestone`, r.error !== null,
        { severity: 'CRITICAL', surface: 'project_milestones', role, failNote: 'insert prošao — mora biti odbijen' }));

      const mId = await createMilestone(projectId, 100);
      r = await ctx.bClient.from('project_milestones').update({ budget: 999 }).eq('id', mId).select('id');
      const { data: mChk } = await admin().from('project_milestones').select('budget').eq('id', mId).single();
      const budgetTampered = mChk?.budget != null && Number(mChk.budget) !== 100;
      results.push(verdict(`02.${role}.2 ${role} ne UPDATE milestone budget`,
        (r.error !== null || (r.data ?? []).length === 0) && !budgetTampered,
        { severity: 'CRITICAL', surface: 'project_milestones.budget', role,
          failNote: budgetTampered ? `budget promijenjen na ${mChk?.budget}` : undefined }));
      await admin().from('project_milestones').delete().eq('id', mId);

      // project_funding real cols: project_id, income_source_id, allocated_amount
      r = await ctx.bClient.from('project_funding')
        .insert({ project_id: projectId, income_source_id: incomeSourceAId, allocated_amount: 5000 });
      results.push(verdict(`02.${role}.3 ${role} ne INSERT funding`, r.error !== null,
        { severity: 'CRITICAL', surface: 'project_funding', role }));

      const eId = await createExpense(ctx.aId, { project_id: projectId, amount: 10, description: 'own' });
      r = await ctx.bClient.from('expenses').delete().eq('id', eId).select('id');
      const { data: eChk } = await admin().from('expenses').select('id, deleted_at').eq('id', eId).maybeSingle();
      const wasDeleted = !eChk || eChk?.deleted_at != null;
      results.push(verdict(`02.${role}.4 ${role} ne DELETE tuđi expense`,
        (r.error !== null || (r.data ?? []).length === 0) && !wasDeleted,
        { severity: 'CRITICAL', surface: 'expenses', role }));
      await admin().from('expenses').delete().eq('id', eId);
    }
  } finally {
    const a = admin();
    await a.from('project_members').delete().eq('project_id', projectId);
    await a.from('project_milestones').delete().eq('project_id', projectId);
    await a.from('project_funding').delete().eq('project_id', projectId);
    await a.from('expenses').delete().eq('project_id', projectId);
    await a.from('income_sources').delete().eq('id', incomeSourceAId);
    await a.from('projects').delete().eq('id', projectId);
  }
  return results;
}

async function spec03_investorScope(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  const projectId = await createProject(ctx.aId);
  await addProjectMember(projectId, ctx.bId, 'investor');
  const milestoneId = await createMilestone(projectId, 1234);
  await createExpense(ctx.aId, { project_id: projectId, amount: 500, description: 'interno' });
  const incomeSourceAId = await createIncomeSource(ctx.aId);
  await createFunding(projectId, incomeSourceAId, 10000);
  try {
    let r: any;
    r = await ctx.bClient.from('expenses').select('id, amount, description').eq('project_id', projectId);
    results.push(verdict('03.1 investor NE čita expenses po project_id',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'expenses', role: 'investor',
        failNote: `investor je dobio ${(r.data ?? []).length} raw financijskih redaka` }));

    r = await ctx.bClient.from('project_worker_payouts').select('id, paid_amount').eq('project_id', projectId);
    results.push(verdict('03.2 investor NE čita worker payouts',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'project_worker_payouts', role: 'investor' }));

    r = await ctx.bClient.from('project_work_entries').select('id').eq('project_id', projectId);
    results.push(verdict('03.3 investor NE čita work entries',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'HIGH', surface: 'project_work_entries', role: 'investor' }));

    r = await ctx.bClient.from('project_workers').select('id').eq('project_id', projectId);
    results.push(verdict('03.4 investor NE čita workere',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'HIGH', surface: 'project_workers', role: 'investor' }));

    r = await ctx.bClient.from('project_funding').select('id, allocated_amount').eq('project_id', projectId);
    results.push(verdict('03.5 investor NE čita project_funding',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'project_funding', role: 'investor',
        failNote: `funding vidljiv (${(r.data ?? []).length} red.)` }));

    r = await ctx.bClient.from('project_documents').select('id').eq('project_id', projectId);
    results.push(verdict('03.6 investor NE čita project_documents',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'HIGH', surface: 'project_documents', role: 'investor' }));

    // Real column is `budget` (not `total_budget`). Same privacy premise.
    r = await ctx.bClient.from('project_milestones').select('id, budget').eq('id', milestoneId);
    const rows = (r.data ?? []);
    const budgetLeak = rows.length > 0 && rows[0].budget != null;
    results.push(verdict('03.7 investor NE čita milestone.budget',
      !r.error && !budgetLeak,
      { severity: 'CRITICAL', surface: 'project_milestones.budget', role: 'investor',
        failNote: budgetLeak ? `budget=${rows[0].budget} izložen investoru` : undefined }));

    r = await ctx.bClient.from('projects').select('id, name').eq('id', projectId);
    results.push(verdict('03.8 investor SMIJE vidjeti projekt (po dizajnu)',
      !r.error && (r.data ?? []).length === 1,
      { severity: 'LOW', surface: 'projects', role: 'investor',
        failNote: 'investor izgubio pristup projektu — regresija' }));
  } finally {
    const a = admin();
    await a.from('expenses').delete().eq('project_id', projectId);
    await a.from('project_funding').delete().eq('project_id', projectId);
    await a.from('project_milestones').delete().eq('project_id', projectId);
    await a.from('project_members').delete().eq('project_id', projectId);
    await a.from('project_worker_payouts').delete().eq('project_id', projectId);
    await a.from('project_work_entries').delete().eq('project_id', projectId);
    await a.from('income_sources').delete().eq('id', incomeSourceAId);
    await a.from('projects').delete().eq('id', projectId);
  }
  return results;
}


async function spec04_rpcSpoofing(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  {
    const sourceAId = await createCustomSource(ctx.aClient, ctx.aId);
    try {
      const r = await ctx.bClient.rpc('set_source_anchor', {
        p_source_id: sourceAId, p_anchor_ts: new Date().toISOString(),
        p_anchor_balance: 9999, p_correction: null,
      });
      results.push(verdict('04.1 set_source_anchor na tuđem sourceu', r.error !== null,
        { severity: 'CRITICAL', surface: 'rpc:set_source_anchor' }));
    } finally { await admin().from('custom_payment_sources').delete().eq('id', sourceAId); }
  }
  {
    const sourceAId = await createCustomSource(ctx.aClient, ctx.aId);
    try {
      const r = await ctx.bClient.rpc('align_source_to_bank', {
        p_source_id: sourceAId, p_bank_balance: 1000, p_as_of: new Date().toISOString(),
      });
      results.push(verdict('04.2 align_source_to_bank na tuđem sourceu', r.error !== null,
        { severity: 'CRITICAL', surface: 'rpc:align_source_to_bank' }));
    } finally { await admin().from('custom_payment_sources').delete().eq('id', sourceAId); }
  }
  {
    const sourceAId = await createCustomSource(ctx.aClient, ctx.aId);
    try {
      const r = await ctx.bClient.rpc('preview_source_balance_after_batch', {
        p_source_id: sourceAId, p_batch_id: '00000000-0000-0000-0000-000000000000',
      });
      const leaked = r.error === null && r.data != null && !(Array.isArray(r.data) && r.data.length === 0);
      results.push(verdict('04.3 preview_source_balance_after_batch scoped', !leaked,
        { severity: 'HIGH', surface: 'rpc:preview_source_balance_after_batch' }));
    } finally { await admin().from('custom_payment_sources').delete().eq('id', sourceAId); }
  }
  {
    const projectAId = await createProject(ctx.aClient, ctx.aId);
    try {
      const r = await ctx.bClient.rpc('soft_delete_record', { p_table: 'projects', p_id: projectAId });
      const { data: after } = await admin().from('projects').select('deleted_at').eq('id', projectAId).single();
      const softDeleted = after?.deleted_at != null;
      results.push(verdict('04.4 soft_delete_record ne dira tuđi projekt', !softDeleted,
        { severity: 'CRITICAL', surface: 'rpc:soft_delete_record', failNote: 'B je soft-deletao A-in projekt' }));
    } finally { await admin().from('projects').delete().eq('id', projectAId); }
  }
  {
    const r = await ctx.bClient.rpc('soft_delete_record', {
      p_table: 'user_roles', p_id: '00000000-0000-0000-0000-000000000000',
    });
    const rejected = r.error !== null && /invalid_table/i.test(String(r.error?.message));
    results.push(verdict('04.5 soft_delete_record odbija whitelistan table', rejected,
      { severity: 'HIGH', surface: 'rpc:soft_delete_record' }));
  }
  return results;
}

async function spec05_removedMember(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  const projectId = await createProject(ctx.aClient, ctx.aId);
  const memberRowId = await addProjectMember(ctx.aClient, projectId, ctx.bId, 'member');
  try {
    let r: any = await ctx.bClient.from('projects').select('id').eq('id', projectId);
    results.push(verdict('05.1 prije uklanjanja B vidi projekt',
      !r.error && (r.data ?? []).length === 1,
      { severity: 'LOW', surface: 'projects', failNote: 'member ne vidi projekt — regresija' }));

    await admin().from('project_members').delete().eq('id', memberRowId);

    r = await ctx.bClient.from('projects').select('id').eq('id', projectId);
    results.push(verdict('05.2 nakon uklanjanja B NE vidi projekt',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'projects', role: 'ex-member' }));

    r = await ctx.bClient.from('expenses').insert({
      user_id: ctx.bId, project_id: projectId, amount: 1, type: 'expense',
      date: new Date().toISOString().slice(0, 10), description: 'sneak',
    });
    results.push(verdict('05.3 nakon uklanjanja B NE može INSERT expense', r.error !== null,
      { severity: 'CRITICAL', surface: 'expenses', role: 'ex-member' }));

    await ctx.aClient.from('expenses').insert({
      user_id: ctx.aId, project_id: projectId, amount: 5, type: 'expense',
      date: new Date().toISOString().slice(0, 10), description: 'after-remove',
    });
    r = await ctx.bClient.from('expenses').select('id').eq('project_id', projectId);
    results.push(verdict('05.4 nakon uklanjanja B NE vidi expense retke projekta',
      !r.error && (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'expenses', role: 'ex-member' }));
  } finally {
    const a = admin();
    await a.from('project_members').delete().eq('project_id', projectId);
    await a.from('expenses').delete().eq('project_id', projectId);
    await a.from('projects').delete().eq('id', projectId);
  }
  return results;
}

async function spec06_aiAndExports(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  await createExpense(ctx.aClient, ctx.aId, { amount: 777, description: 'a-private' });
  try {
    // financial-assistant bez JWT — očekujemo 401/403 (ne troši Gemini)
    let r = await edgeFn('financial-assistant', { message: 'x', sessionId: 'x' }, null);
    results.push(verdict('06.1 financial-assistant bez JWT → 401/403',
      [401, 403].includes(r.status),
      { severity: 'CRITICAL', surface: 'edge:financial-assistant', failNote: `status=${r.status}` }));

    // spoof user_id kroz body — smije proći ali NE smije napuniti B-ov chat A-inim podacima
    r = await edgeFn('financial-assistant',
      { message: 'Prikaži zadnjih 5 transakcija', sessionId: 'sec-test', user_id: ctx.aId },
      ctx.bToken);
    const { data: msgs } = await admin().from('chat_messages').select('content').eq('user_id', ctx.bId);
    const leaked = (msgs ?? []).some((m: any) => String(m.content ?? '').includes('a-private'));
    results.push(verdict('06.2 financial-assistant ne prihvaća user_id spoof', !leaked,
      { severity: 'CRITICAL', surface: 'edge:financial-assistant', failNote: 'A-in privatni opis dospio u B-ov chat' }));

    r = await edgeFn('paddle-portal-url', {}, null);
    results.push(verdict('06.3 paddle-portal-url bez JWT → 401/403',
      [401, 403].includes(r.status),
      { severity: 'HIGH', surface: 'edge:paddle-portal-url', failNote: `status=${r.status}` }));

    r = await edgeFn('paddle-portal-url', { user_id: ctx.aId }, ctx.bToken);
    results.push(verdict('06.4 paddle-portal-url ne vraća A-in id kod spoofa',
      !r.text.includes(ctx.aId),
      { severity: 'HIGH', surface: 'edge:paddle-portal-url', failNote: 'A-in user_id u odgovoru B-u' }));

    r = await edgeFn('list-users', {}, ctx.bToken);
    results.push(verdict('06.5 list-users bez admin uloge → 401/403',
      [401, 403].includes(r.status),
      { severity: 'CRITICAL', surface: 'edge:list-users', failNote: `status=${r.status}` }));

    r = await edgeFn('admin-manage-user', { action: 'delete', user_id: ctx.aId }, ctx.bToken);
    results.push(verdict('06.6 admin-manage-user bez admin uloge → 401/403',
      [401, 403].includes(r.status),
      { severity: 'CRITICAL', surface: 'edge:admin-manage-user', failNote: `status=${r.status}` }));
  } finally {
    const a = admin();
    await a.from('expenses').delete().eq('user_id', ctx.aId);
    await a.from('chat_messages').delete().eq('user_id', ctx.aId);
    await a.from('chat_messages').delete().eq('user_id', ctx.bId);
  }
  return results;
}

async function spec07_krugMembership(ctx: Ctx): Promise<Verdict[]> {
  const results: Verdict[] = [];
  const { data: k, error: kerr } = await ctx.aClient
    .from('krug').insert({ name: 'sec-krug', owner_id: ctx.aId }).select('id').single();
  if (kerr) return [{ name: '07.setup', status: 'FAIL', severity: 'MEDIUM', note: `krug insert: ${kerr.message}` }];
  const krugId = k!.id;
  await admin().from('krug_membership').insert({ krug_id: krugId, user_id: ctx.bId, role: 'obicni' });
  try {
    let r: any = await ctx.bClient.from('krug').select('id').eq('id', krugId);
    results.push(verdict('07.1 obicni vidi krug (dozvoljeno)',
      !r.error && (r.data ?? []).length === 1,
      { severity: 'LOW', surface: 'krug' }));

    r = await ctx.bClient.from('krug_membership').update({ role: 'punopravni' })
      .eq('krug_id', krugId).eq('user_id', ctx.bId).select('id');
    results.push(verdict('07.2 obicni NE promovira sebe u punopravnog',
      r.error !== null || (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'krug_membership.role', role: 'obicni' }));

    r = await ctx.bClient.from('krug_membership').delete()
      .eq('krug_id', krugId).eq('user_id', ctx.aId).select('id');
    results.push(verdict('07.3 obicni NE briše ownera',
      r.error !== null || (r.data ?? []).length === 0,
      { severity: 'CRITICAL', surface: 'krug_membership', role: 'obicni' }));

    r = await ctx.bClient.from('krug_shared_payment_source').insert({
      krug_id: krugId, source_id: '00000000-0000-0000-0000-000000000000', added_by: ctx.bId,
    });
    results.push(verdict('07.4 obicni NE dodaje shared payment source',
      r.error !== null,
      { severity: 'HIGH', surface: 'krug_shared_payment_source', role: 'obicni' }));

    r = await ctx.bClient.from('krug').update({ name: 'hijacked' }).eq('id', krugId).select('id');
    const { data: chk } = await admin().from('krug').select('name').eq('id', krugId).single();
    results.push(verdict('07.5 obicni NE mijenja krug meta',
      (r.error !== null || (r.data ?? []).length === 0) && chk?.name === 'sec-krug',
      { severity: 'CRITICAL', surface: 'krug.name', role: 'obicni' }));
  } finally {
    const a = admin();
    await a.from('krug_shared_payment_source').delete().eq('krug_id', krugId);
    await a.from('krug_membership').delete().eq('krug_id', krugId);
    await a.from('krug').delete().eq('id', krugId);
  }
  return results;
}

const SPEC_MAP: Record<number, { name: string; run: (ctx: Ctx) => Promise<Verdict[]> }[]> = {
  1: [
    { name: '01-cross-user-reads', run: spec01_crossUserReads },
    { name: '02-role-writes', run: spec02_roleWrites },
    { name: '03-investor-scope', run: spec03_investorScope },
  ],
  2: [
    { name: '04-rpc-spoofing', run: spec04_rpcSpoofing },
    { name: '05-removed-member', run: spec05_removedMember },
  ],
  3: [
    { name: '06-ai-and-exports', run: spec06_aiAndExports },
    { name: '07-krug-membership', run: spec07_krugMembership },
  ],
};

function summarizeRedCandidates(all: { spec: string; results: Verdict[] }[]) {
  const find = (specName: string, idPrefix: string) => {
    const s = all.find(x => x.spec === specName);
    if (!s) return { verdict: 'NEIZVEDENO', evidence: `spec ${specName} nije pokrenut u ovom partu` };
    const v = s.results.find(r => r.name.startsWith(idPrefix));
    if (!v) return { verdict: 'NEIZVEDENO', evidence: `test ${idPrefix} nije pronađen` };
    return {
      verdict: v.status === 'FAIL' ? 'POTVRĐEN' : 'OBOREN',
      evidence: v.status === 'FAIL' ? (v.failNote || v.note || 'FAIL bez detalja') : `PASS: ${v.name}`,
      severity: v.severity,
    };
  };
  return {
    investor_expenses: { desc: 'investor čita expenses po project_id', ...find('03-investor-scope', '03.1') },
    investor_project_funding: { desc: 'investor čita project_funding', ...find('03-investor-scope', '03.5') },
    investor_worker_payouts: { desc: 'investor čita project_worker_payouts', ...find('03-investor-scope', '03.2') },
    investor_work_entries: { desc: 'investor čita project_work_entries', ...find('03-investor-scope', '03.3') },
    investor_project_documents: { desc: 'investor čita project_documents', ...find('03-investor-scope', '03.6') },
    investor_milestone_total_budget: { desc: 'investor čita milestone.total_budget', ...find('03-investor-scope', '03.7') },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // LOCK 1: JWT + Milan-only
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'unauthorized', reason: 'missing_bearer' });
  }
  const token = authHeader.replace('Bearer ', '');
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return json(401, { error: 'unauthorized', reason: 'invalid_jwt' });
  }
  if (claims.claims.sub !== MILAN_UID) {
    return json(403, { error: 'forbidden', reason: 'not_authorized_operator' });
  }

  // Parse part
  const url = new URL(req.url);
  let part = Number(url.searchParams.get('part') ?? '0');
  if (![0, 1, 2, 3].includes(part)) part = 0;

  const startedAt = new Date().toISOString();
  const password = `sec-audit-${crypto.randomUUID()}`;
  const specsToRun = part === 0
    ? [...SPEC_MAP[1], ...SPEC_MAP[2], ...SPEC_MAP[3]]
    : SPEC_MAP[part];

  const allResults: { spec: string; results: Verdict[]; error?: string }[] = [];
  let baseline: Record<string, number> = {};
  let after: Record<string, number> = {};
  let fatal: string | null = null;

  try {
    // Ensure users
    const aId = await ensureSecUser(SEC_A_EMAIL, password);
    const bId = await ensureSecUser(SEC_B_EMAIL, password);
    baseline = await snapshot();

    const A = await signIn(SEC_A_EMAIL, password);
    const B = await signIn(SEC_B_EMAIL, password);
    if (A.userId !== aId || B.userId !== bId) throw new Error('user id mismatch after sign-in');

    const ctx: Ctx = {
      aId, bId,
      aClient: A.client, bClient: B.client,
      aToken: A.token, bToken: B.token,
    };

    for (const s of specsToRun) {
      try {
        const results = await s.run(ctx);
        allResults.push({ spec: s.name, results });
      } catch (e) {
        allResults.push({ spec: s.name, results: [], error: (e as Error).message });
      }
    }
  } catch (e) {
    fatal = (e as Error).message;
  } finally {
    // LOCK 2: teardown regardless of outcome — purge synthetic user data
    try {
      const a = admin();
      const cleanupIds: string[] = [];
      let page = 1;
      while (page <= 30) {
        const { data } = await a.auth.admin.listUsers({ page, perPage: 200 });
        if (!data) break;
        for (const u of data.users) {
          if (u.email && (u.email.toLowerCase() === SEC_A_EMAIL || u.email.toLowerCase() === SEC_B_EMAIL)) {
            cleanupIds.push(u.id);
          }
        }
        if (data.users.length < 200) break;
        page++;
      }
      const cleanupTables = [
        'expenses', 'custom_payment_sources', 'imported_statements', 'pdf_parse_jobs',
        'project_work_entries', 'project_workers', 'project_members', 'project_documents',
        'project_milestones', 'project_funding', 'project_worker_payouts',
        'project_collaborators', 'projects', 'user_entitlements',
        'krug_membership', 'krug_shared_payment_source', 'krug',
        'notifications', 'chat_messages', 'app_diagnostics_logs',
        'user_login_logs', 'feedback_submissions', 'reminders', 'savings_goals',
      ];
      for (const uid of cleanupIds) {
        for (const t of cleanupTables) {
          try { await a.from(t).delete().eq('user_id', uid); } catch { /* best effort */ }
        }
        try { await a.from('krug').delete().eq('owner_id', uid); } catch { /* noop */ }
      }
      after = await snapshot();
    } catch (e) {
      fatal = (fatal ? fatal + ' | ' : '') + 'teardown: ' + (e as Error).message;
    }
  }

  const parity: Record<string, { before: number; after: number; delta: number }> = {};
  let parityOk = true;
  for (const t of LIVE_TABLES) {
    const b = baseline[t] ?? -1;
    const a = after[t] ?? -1;
    const delta = a - b;
    parity[t] = { before: b, after: a, delta };
    if (delta !== 0) parityOk = false;
  }

  const flat = allResults.flatMap(a => a.results);
  const totals = {
    total: flat.length,
    pass: flat.filter(v => v.status === 'PASS').length,
    fail: flat.filter(v => v.status === 'FAIL').length,
    skip: flat.filter(v => v.status === 'SKIP').length,
    critical_fails: flat.filter(v => v.status === 'FAIL' && v.severity === 'CRITICAL').length,
  };

  return json(200, {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    part,
    parts_available: [1, 2, 3],
    fatal,
    baseline_parity: { ok: parityOk, tables: parity },
    totals,
    red_candidates: summarizeRedCandidates(allResults),
    specs: allResults,
  });
});
