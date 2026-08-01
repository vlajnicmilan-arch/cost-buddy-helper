import { test, expect } from '@playwright/test';
import { authedClientFor, admin } from '../helpers/clients';
import { createProject, addProjectMember } from '../helpers/fixtures';
import { ensureSecEntitlements } from '../helpers/users';

/**
 * Korak D — matrica prava PISANJA po ulogama.
 *
 * Provjera ide na ODGOVOR BAZE, nikad na sučelje.
 *
 * KLJUČNO PRAVILO OVOG SPECA — razlog odbijanja se provjerava, ne samo činjenica:
 *
 *   1. INSERT odbijanja  → mora vratiti PostgREST/PG kod '42501'
 *      (RLS / trigger). Kodovi 42703 (nepostojeći stupac), 23502 (NOT NULL),
 *      23503 (FK), 22P02 (kriv tip) NISU dokaz zaštite — spec ih tretira kao PAD.
 *
 *   2. UPDATE / DELETE odbijanja preko RLS-a NE vraćaju grešku — Postgres samo
 *      ne pogodi nijedan redak. Da to ne bi bilo lažno "prolazi kroz tipfeler",
 *      svaki takav slučaj ima OWNER CONTROL: identičan payload prvo mora
 *      USPJETI kao vlasnik (dokaz da stupac postoji i da je vrijednost valjana),
 *      a tek onda se provjerava da isti payload kao druga uloga NE promijeni
 *      redak (očitano service-role klijentom, ne kroz RLS pogled pozivatelja).
 *
 *   3. Uspjeh se nikad ne čita kroz `.select()` pozivatelja (member ne smije
 *      čitati baznu tablicu) — nego service-role ponovnim čitanjem retka.
 */

type Role = 'member' | 'viewer' | 'worker' | 'investor';
const ROLES: Role[] = ['member', 'viewer', 'worker', 'investor'];
const NON_MEMBER_ROLES: Role[] = ['viewer', 'worker', 'investor'];

const RLS = '42501';

/** Očekivano odbijanje s razlogom = politika ili trigger (42501). */
function expectDeniedByPolicy(res: { error: any }, what: string): void {
  expect(res.error, `${what}: očekivano odbijanje, a upis je PROŠAO`).not.toBeNull();
  const code = res.error?.code;
  expect(
    code,
    `${what}: odbijeno kodom ${code} (${res.error?.message}) — to nije RLS/trigger nego greška sheme/payloada`,
  ).toBe(RLS);
}

/** Uspjeh — bez greške; koristi se i kao "owner control" dokaz valjanosti payloada. */
function expectAllowed(res: { error: any }, what: string): void {
  expect(res.error?.message ?? null, `${what}: upis je odbijen, a smio je proći`).toBeNull();
}

async function readMilestone(id: string) {
  const { data, error } = await admin()
    .from('project_milestones')
    .select('id, status, budget, investor_price')
    .eq('id', id)
    .single();
  if (error) throw new Error(`readMilestone: ${error.message}`);
  return data as any;
}

async function readProject(id: string) {
  const { data, error } = await admin()
    .from('projects')
    .select('id, contract_value')
    .eq('id', id)
    .single();
  if (error) throw new Error(`readProject: ${error.message}`);
  return data as any;
}

const BUDGET = 1000;
const PRICE = 1500;

test.describe('09 — matrica prava pisanja po ulogama', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  const projectByRole: Record<string, string> = {};
  const milestoneByRole: Record<string, string> = {};
  let ctrlProjectId: string; // projekt bez ijednog člana (za članske insert testove)
  let workerId: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client;
    await ensureSecEntitlements(aId);
    await ensureSecEntitlements(bId);

    for (const role of ROLES) {
      const pid = await createProject(aClient, aId, `sec-wr-${role}-${Date.now()}`);
      projectByRole[role] = pid;
      await addProjectMember(aClient, pid, bId, role);
      const { data, error } = await aClient
        .from('project_milestones')
        .insert({ project_id: pid, name: `M-${role}`, budget: BUDGET, investor_price: PRICE, status: 'pending' })
        .select('id')
        .single();
      if (error) throw new Error(`milestone insert (${role}): ${error.message}`);
      milestoneByRole[role] = data.id;
    }

    ctrlProjectId = await createProject(aClient, aId, `sec-wr-ctrl-${Date.now()}`);

    const w = await aClient
      .from('project_workers')
      .insert({
        project_id: projectByRole.member,
        first_name: 'Sec',
        last_name: 'Worker',
        position: 'zidar',
      })
      .select('id')
      .single();
    if (w.error) throw new Error(`worker insert: ${w.error.message}`);
    workerId = w.data.id;
  });

  test.afterAll(async () => {
    const a = admin();
    const pids = [...Object.values(projectByRole), ctrlProjectId].filter(Boolean);
    for (const pid of pids) {
      await a.from('project_contract_amendments').delete().eq('project_id', pid);
      await a.from('project_budget_revisions').delete().eq('project_id', pid);
      await a.from('milestone_budget_revisions').delete().eq('project_id', pid);
      await a.from('project_documents').delete().eq('project_id', pid);
      const { data: ms } = await a.from('project_milestones').select('id').eq('project_id', pid);
      for (const m of ms ?? []) {
        await a.from('milestone_checklist_items').delete().eq('milestone_id', m.id);
      }
      await a.from('project_worker_rate_history').delete().eq('worker_id', workerId);
      await a.from('project_workers').delete().eq('project_id', pid);
      await a.from('project_invitations').delete().eq('project_id', pid);
      await a.from('project_milestones').delete().eq('project_id', pid);
      await a.from('project_members').delete().eq('project_id', pid);
      await a.from('projects').delete().eq('id', pid);
    }
    // Pretplate vraćene u zdravo stanje nakon downgrade testova.
    await ensureSecEntitlements(aId);
    await ensureSecEntitlements(bId);
  });

  // ── 1. Status faze ─────────────────────────────────────────────────────────
  test('owner control: UPDATE statusa faze prolazi vlasniku (payload je valjan)', async () => {
    const mid = milestoneByRole.viewer;
    const res = await aClient.from('project_milestones').update({ status: 'in_progress' }).eq('id', mid);
    expectAllowed(res, 'owner status update');
    expect((await readMilestone(mid)).status).toBe('in_progress');
    await aClient.from('project_milestones').update({ status: 'pending' }).eq('id', mid);
  });

  test('member: UPDATE statusa faze PROLAZI', async () => {
    const mid = milestoneByRole.member;
    const res = await bClient.from('project_milestones').update({ status: 'in_progress' }).eq('id', mid);
    expectAllowed(res, 'member status update');
    expect((await readMilestone(mid)).status, 'member nije uspio promijeniti status').toBe('in_progress');
  });

  for (const role of NON_MEMBER_ROLES) {
    test(`${role}: UPDATE statusa faze ne mijenja redak`, async () => {
      const mid = milestoneByRole[role];
      const before = await readMilestone(mid);
      const res = await bClient.from('project_milestones').update({ status: 'completed' }).eq('id', mid);
      expect(res.error?.message ?? null).toBeNull(); // RLS ne baca grešku, samo ne pogodi redak
      expect((await readMilestone(mid)).status, `${role} je promijenio status`).toBe(before.status);
    });
  }

  // ── 2. Iznosi na fazi (trigger guard_milestone_column_writes) ──────────────
  test('owner control: UPDATE budget prolazi vlasniku', async () => {
    const mid = milestoneByRole.viewer;
    const res = await aClient.from('project_milestones').update({ budget: 2222 }).eq('id', mid);
    expectAllowed(res, 'owner budget update');
    expect(Number((await readMilestone(mid)).budget)).toBe(2222);
    await aClient.from('project_milestones').update({ budget: BUDGET }).eq('id', mid);
  });

  test('member: UPDATE budget odbijen triggerom (42501, milestone_amount_forbidden)', async () => {
    const mid = milestoneByRole.member;
    const res = await bClient.from('project_milestones').update({ budget: 9999 }).eq('id', mid);
    expectDeniedByPolicy(res, 'member budget update');
    expect(res.error.message).toContain('milestone_amount_forbidden');
    expect(Number((await readMilestone(mid)).budget)).toBe(BUDGET);
  });

  test('member: UPDATE investor_price odbijen triggerom (42501)', async () => {
    const mid = milestoneByRole.member;
    const res = await bClient.from('project_milestones').update({ investor_price: 9999 }).eq('id', mid);
    expectDeniedByPolicy(res, 'member investor_price update');
    expect(res.error.message).toContain('milestone_amount_forbidden');
    expect(Number((await readMilestone(mid)).investor_price)).toBe(PRICE);
  });

  // ── 3. projects.contract_value ─────────────────────────────────────────────
  test('owner control: UPDATE contract_value prolazi vlasniku', async () => {
    const pid = projectByRole.member;
    const res = await aClient.from('projects').update({ contract_value: 55555 }).eq('id', pid);
    expectAllowed(res, 'owner contract_value update');
    expect(Number((await readProject(pid)).contract_value)).toBe(55555);
  });

  for (const role of ROLES) {
    test(`${role}: UPDATE contract_value ne mijenja projekt`, async () => {
      const pid = projectByRole[role];
      const before = await readProject(pid);
      const res = await bClient.from('projects').update({ contract_value: 1 }).eq('id', pid);
      expect(res.error?.message ?? null).toBeNull();
      const after = await readProject(pid);
      expect(after.contract_value, `${role} je promijenio contract_value`).toEqual(before.contract_value);
    });
  }

  // ── 4. INSERT / DELETE faze ────────────────────────────────────────────────
  test('member: INSERT faze odbijen politikom (42501)', async () => {
    const pid = projectByRole.member;
    // owner control — isti payload mora proći vlasniku
    const ctrl = await aClient
      .from('project_milestones')
      .insert({ project_id: pid, name: 'ctrl-insert', status: 'pending' })
      .select('id')
      .single();
    expectAllowed(ctrl, 'owner control milestone insert');
    await admin().from('project_milestones').delete().eq('id', ctrl.data.id);

    const res = await bClient
      .from('project_milestones')
      .insert({ project_id: pid, name: 'member-insert', status: 'pending' });
    expectDeniedByPolicy(res, 'member milestone insert');
  });

  test('member: DELETE faze ne briše redak; vlasniku prolazi', async () => {
    const pid = projectByRole.member;
    const ins = await aClient
      .from('project_milestones')
      .insert({ project_id: pid, name: 'del-target', status: 'pending' })
      .select('id')
      .single();
    expectAllowed(ins, 'owner control milestone insert (delete target)');
    const mid = ins.data.id;

    const del = await bClient.from('project_milestones').delete().eq('id', mid);
    expect(del.error?.message ?? null).toBeNull();
    const still = await admin().from('project_milestones').select('id').eq('id', mid);
    expect(still.data ?? [], 'member je obrisao fazu').toHaveLength(1);

    const ownerDel = await aClient.from('project_milestones').delete().eq('id', mid);
    expectAllowed(ownerDel, 'owner milestone delete');
    const gone = await admin().from('project_milestones').select('id').eq('id', mid);
    expect(gone.data ?? []).toHaveLength(0);
  });

  // ── 5. Novčane revizije i aneksi ───────────────────────────────────────────
  test('milestone_budget_revisions: vlasnik prolazi, member/viewer/investor odbijeni (42501)', async () => {
    const pid = projectByRole.member;
    const mid = milestoneByRole.member;
    const ctrl = await aClient
      .from('milestone_budget_revisions')
      .insert({
        milestone_id: mid, project_id: pid, user_id: aId,
        previous_amount: BUDGET, new_amount: BUDGET + 100, reason: 'ctrl',
      })
      .select('id')
      .single();
    expectAllowed(ctrl, 'owner control milestone revision');
    await admin().from('milestone_budget_revisions').delete().eq('id', ctrl.data.id);

    for (const role of ['member', 'viewer', 'investor'] as Role[]) {
      const res = await bClient.from('milestone_budget_revisions').insert({
        milestone_id: milestoneByRole[role], project_id: projectByRole[role], user_id: bId,
        previous_amount: BUDGET, new_amount: BUDGET + 100, reason: `${role}-try`,
      });
      expectDeniedByPolicy(res, `${role} milestone revision insert`);
    }
  });

  test('project_budget_revisions: vlasnik prolazi, member/viewer/investor odbijeni (42501)', async () => {
    const pid = projectByRole.member;
    const ctrl = await aClient
      .from('project_budget_revisions')
      .insert({ project_id: pid, user_id: aId, previous_amount: 100, new_amount: 200, reason: 'ctrl' })
      .select('id')
      .single();
    expectAllowed(ctrl, 'owner control project revision');
    await admin().from('project_budget_revisions').delete().eq('id', ctrl.data.id);

    for (const role of ['member', 'viewer', 'investor'] as Role[]) {
      const res = await bClient.from('project_budget_revisions').insert({
        project_id: projectByRole[role], user_id: bId,
        previous_amount: 100, new_amount: 200, reason: `${role}-try`,
      });
      expectDeniedByPolicy(res, `${role} project revision insert`);
    }
  });

  test('project_contract_amendments: samo vlasnik; sve uloge odbijene (42501)', async () => {
    // owner control na kontrolnom projektu (anex zaključava baseline contract_value)
    const ctrl = await aClient
      .from('project_contract_amendments')
      .insert({ project_id: ctrlProjectId, user_id: aId, amendment_amount: 500, note: 'ctrl' })
      .select('id')
      .single();
    expectAllowed(ctrl, 'owner control contract amendment');
    await admin().from('project_contract_amendments').delete().eq('id', ctrl.data.id);

    for (const role of ROLES) {
      const res = await bClient.from('project_contract_amendments').insert({
        project_id: projectByRole[role], user_id: bId, amendment_amount: 500, note: `${role}-try`,
      });
      expectDeniedByPolicy(res, `${role} contract amendment insert`);
    }
  });

  // ── 6. Dokumenti i checkliste (napredak = owner + member) ──────────────────
  test('dokumenti: member PROLAZI, viewer/investor odbijeni (42501)', async () => {
    const ok = await bClient.from('project_documents').insert({
      project_id: projectByRole.member,
      name: 'sec-doc.pdf',
      storage_path: `sec/${Date.now()}.pdf`,
      uploaded_by: bId,
    });
    expectAllowed(ok, 'member document insert');
    const { data: docs } = await admin()
      .from('project_documents')
      .select('id')
      .eq('project_id', projectByRole.member);
    expect((docs ?? []).length, 'member dokument nije zapisan').toBeGreaterThan(0);

    for (const role of ['viewer', 'investor'] as Role[]) {
      const res = await bClient.from('project_documents').insert({
        project_id: projectByRole[role],
        name: 'sec-doc.pdf',
        storage_path: `sec/${role}-${Date.now()}.pdf`,
        uploaded_by: bId,
      });
      expectDeniedByPolicy(res, `${role} document insert`);
    }
  });

  test('checklist: member PROLAZI, viewer odbijen (42501)', async () => {
    const ok = await bClient.from('milestone_checklist_items').insert({
      milestone_id: milestoneByRole.member, user_id: bId, title: 'sec-item',
    });
    expectAllowed(ok, 'member checklist insert');
    const { data: items } = await admin()
      .from('milestone_checklist_items')
      .select('id')
      .eq('milestone_id', milestoneByRole.member);
    expect((items ?? []).length, 'member checklist nije zapisan').toBeGreaterThan(0);

    const res = await bClient.from('milestone_checklist_items').insert({
      milestone_id: milestoneByRole.viewer, user_id: bId, title: 'sec-item',
    });
    expectDeniedByPolicy(res, 'viewer checklist insert');
  });

  // ── 7. Radnici ─────────────────────────────────────────────────────────────
  test('project_workers INSERT: sve uloge osim vlasnika odbijene (42501)', async () => {
    for (const role of ROLES) {
      const res = await bClient.from('project_workers').insert({
        project_id: projectByRole[role], first_name: 'X', last_name: 'Y', position: 'zidar',
      });
      expectDeniedByPolicy(res, `${role} worker insert`);
    }
  });

  test('hourly_rate: izravan UPDATE zabranjen svima (trigger), vlasnik ide kroz RPC', async () => {
    const before = await admin().from('project_workers').select('hourly_rate').eq('id', workerId).single();

    // Vlasnik: izravan UPDATE pada na trigger 42501 (baseline ponašanje, ne RLS).
    const ownerDirect = await aClient.from('project_workers').update({ hourly_rate: 12 }).eq('id', workerId);
    expectDeniedByPolicy(ownerDirect, 'owner direct hourly_rate update');

    // Ostale uloge: RLS ih ne pogodi — nema greške, ali ni promjene.
    for (const role of ROLES) {
      const res = await bClient.from('project_workers').update({ hourly_rate: 99 }).eq('id', workerId);
      expect(res.error?.message ?? null, `${role} hourly_rate update`).toBeNull();
      const after = await admin().from('project_workers').select('hourly_rate').eq('id', workerId).single();
      expect(after.data?.hourly_rate, `${role} je promijenio hourly_rate`).toEqual(before.data?.hourly_rate);
    }

    // Owner control: dopušteni put mora raditi (dokaz da stupac i vrijednost postoje).
    const rpc = await aClient.rpc('set_worker_hourly_rate', {
      p_worker_id: workerId, p_rate: 15, p_effective_from: new Date().toISOString().slice(0, 10),
    });
    expect(rpc.error?.message ?? null, 'vlasnik ne može postaviti satnicu kroz RPC').toBeNull();
    const rpcAfter = await admin().from('project_workers').select('hourly_rate').eq('id', workerId).single();
    expect(Number(rpcAfter.data?.hourly_rate)).toBe(15);

    // Član ne smije kroz isti RPC.
    const memberRpc = await bClient.rpc('set_worker_hourly_rate', {
      p_worker_id: workerId, p_rate: 30, p_effective_from: new Date().toISOString().slice(0, 10),
    });
    expect(memberRpc.error?.code, 'member je prošao kroz RPC za satnicu').toBe(RLS);
  });

  // ── 8. Članstvo i pozivnice ────────────────────────────────────────────────
  test('project_members INSERT: sve uloge osim vlasnika odbijene (42501)', async () => {
    const ctrl = await aClient
      .from('project_members')
      .insert({ project_id: ctrlProjectId, user_id: bId, role: 'viewer' })
      .select('id')
      .single();
    expectAllowed(ctrl, 'owner control member insert');
    await admin().from('project_members').delete().eq('id', ctrl.data.id);

    // B (bilo koja uloga) pokušava dodati sebe na projekt gdje nije član.
    const res = await bClient
      .from('project_members')
      .insert({ project_id: ctrlProjectId, user_id: bId, role: 'member' });
    expectDeniedByPolicy(res, 'non-owner member insert');

    // I na projektima gdje jest član/viewer/worker/investor.
    for (const role of ROLES) {
      const r = await bClient
        .from('project_members')
        .insert({ project_id: projectByRole[role], user_id: aId, role: 'viewer' });
      expectDeniedByPolicy(r, `${role} member insert`);
    }
  });

  test('project_invitations INSERT: sve uloge osim vlasnika odbijene (42501)', async () => {
    const ctrl = await aClient
      .from('project_invitations')
      .insert({ project_id: ctrlProjectId, email: `sec-ctrl-${Date.now()}@example.com`, invited_by: aId })
      .select('id')
      .single();
    expectAllowed(ctrl, 'owner control invitation insert');
    await admin().from('project_invitations').delete().eq('id', ctrl.data.id);

    for (const role of ROLES) {
      const res = await bClient.from('project_invitations').insert({
        project_id: projectByRole[role],
        email: `sec-${role}-${Date.now()}@example.com`,
        invited_by: bId,
      });
      expectDeniedByPolicy(res, `${role} invitation insert`);
    }
  });

  // ── 9. Pretplata veže samo vlastite projekte ───────────────────────────────
  test('vlasnik BEZ pretplate: odbijen na VLASTITOM projektu', async () => {
    await admin().from('user_entitlements').delete().eq('user_id', aId);
    try {
      const pid = projectByRole.worker;
      const mid = milestoneByRole.worker;
      const before = await readMilestone(mid);

      const upd = await aClient.from('project_milestones').update({ status: 'completed' }).eq('id', mid);
      expect(upd.error?.message ?? null).toBeNull(); // restriktivna politika → 0 redaka
      expect((await readMilestone(mid)).status, 'vlasnik bez pretplate je pisao').toBe(before.status);

      const ins = await aClient
        .from('project_milestones')
        .insert({ project_id: pid, name: 'no-sub', status: 'pending' });
      expectDeniedByPolicy(ins, 'vlasnik bez pretplate — insert faze');
    } finally {
      await ensureSecEntitlements(aId);
    }
  });

  test('member BEZ vlastite pretplate: PROLAZI na tuđem projektu (vlasnik plaća)', async () => {
    await admin().from('user_entitlements').delete().eq('user_id', bId);
    try {
      const mid = milestoneByRole.member;
      await admin().from('project_milestones').update({ status: 'pending' }).eq('id', mid);
      const res = await bClient.from('project_milestones').update({ status: 'in_progress' }).eq('id', mid);
      expectAllowed(res, 'member bez pretplate — status update');
      expect(
        (await readMilestone(mid)).status,
        'member bez pretplate je blokiran na tuđem projektu',
      ).toBe('in_progress');
    } finally {
      await ensureSecEntitlements(bId);
    }
  });
});
