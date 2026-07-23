import { writeFile, readFile } from 'node:fs/promises';
import { admin } from './clients';

/** Živi produkcijski setovi (isključujemo sintetiku). */
const LIVE_TABLES = [
  'projects',
  'expenses',
  'custom_payment_sources',
  'user_entitlements',
  'krug',
  'krug_membership',
  'project_members',
  'project_milestones',
  'project_worker_payouts',
  'imported_statements',
];

const SNAPSHOT_PATH = 'e2e/security/.counts-before.json';

async function snapshot(): Promise<Record<string, number>> {
  const a = admin();
  const out: Record<string, number> = {};
  for (const t of LIVE_TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (a as any)
      .from(t)
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${t}: ${error.message}`);
    out[t] = count ?? 0;
  }
  return out;
}

export async function writeBaseline(): Promise<void> {
  const snap = await snapshot();
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
  // eslint-disable-next-line no-console
  console.log('[security] baseline counts:', snap);
}

export async function assertBaselineParity(): Promise<void> {
  const before = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')) as Record<string, number>;
  const after = await snapshot();
  const diffs: string[] = [];
  for (const t of LIVE_TABLES) {
    if (before[t] !== after[t]) {
      diffs.push(`${t}: prije=${before[t]} poslije=${after[t]}`);
    }
  }
  if (diffs.length > 0) {
    throw new Error(
      `[security] PARITY VIOLATION — sintetika je iscurila u žive tablice:\n  ${diffs.join('\n  ')}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log('[security] parity OK — svi COUNT prije=poslije za', LIVE_TABLES.length, 'tablica');
}
