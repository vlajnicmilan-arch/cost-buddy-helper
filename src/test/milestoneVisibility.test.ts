import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readMilestoneAmount, isAmountHidden, sumVisibleAmounts } from '@/lib/milestoneAmounts';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('milestoneAmounts — skriveno nikad ne postaje 0', () => {
  it('null / undefined ostaju null', () => {
    expect(readMilestoneAmount(null)).toBeNull();
    expect(readMilestoneAmount(undefined)).toBeNull();
    expect(readMilestoneAmount('')).toBeNull();
  });

  it('0 ostaje 0 (legitimna vrijednost)', () => {
    expect(readMilestoneAmount(0)).toBe(0);
    expect(readMilestoneAmount('0')).toBe(0);
  });

  it('valjani brojevi se parsiraju', () => {
    expect(readMilestoneAmount('1234.56')).toBe(1234.56);
    expect(readMilestoneAmount(99)).toBe(99);
  });

  it('nevaljan broj ne postaje 0', () => {
    expect(readMilestoneAmount('abc')).toBeNull();
    expect(readMilestoneAmount(NaN)).toBeNull();
  });

  it('isAmountHidden razlikuje skriveno od nule', () => {
    expect(isAmountHidden(null)).toBe(true);
    expect(isAmountHidden(undefined)).toBe(true);
    expect(isAmountHidden(0)).toBe(false);
  });

  it('sumVisibleAmounts preskače skrivene, ne broji ih kao 0', () => {
    expect(sumVisibleAmounts([10, null, 5])).toBe(15);
    expect(sumVisibleAmounts([null, undefined])).toBeNull();
    expect(sumVisibleAmounts([0, null])).toBe(0);
  });
});

describe('Korak A — sva mjesta čitanja faza idu preko role-scoped pogleda', () => {
  const readSites = [
    'src/hooks/useProjectMilestones.ts',
    'src/hooks/useProjectWorkLogs.ts',
    'src/components/projects/ProjectsPanel.tsx',
    'src/components/business/BusinessProjects.tsx',
    'src/components/projects/ProjectReportsDialog.tsx',
    'src/lib/mcp/tools/list-project-milestones.ts',
    'src/lib/mcp/tools/get-project-details.ts',
    'src/lib/dataExportZip.ts',
  ];

  it.each(readSites)('%s koristi project_milestones_scoped', (file) => {
    expect(read(file)).toContain('project_milestones_scoped');
  });

  it('MCP bundlana kopija je usklađena s izvorom', () => {
    const bundle = read('supabase/functions/mcp/index.ts');
    expect(bundle).toContain('project_milestones_scoped');
    expect(bundle).not.toMatch(/from\("project_milestones"\)\s*\.select/);
  });

  it('hook ne pretvara skriveni iznos u 0', () => {
    const hook = read('src/hooks/useProjectMilestones.ts');
    expect(hook).toContain('budget: readMilestoneAmount(m.budget)');
    expect(hook).not.toContain('budget: Number(m.budget) || 0');
  });

  it('realtime payload služi samo kao signal za ponovni dohvat', () => {
    const hook = read('src/hooks/useProjectMilestones.ts');
    expect(hook).not.toMatch(/payload\.(new|old)/);
  });

  it('project-insights je ograničen na vlasnika, viewera i člana', () => {
    const fn = read('supabase/functions/project-insights/index.ts');
    expect(fn).toContain("['owner', 'viewer', 'member'].includes(role)");
  });
});

/**
 * Hvata BUDUĆA mjesta čitanja: skenira cijeli src/ i supabase/functions/,
 * ne samo poimence navedene datoteke. Čitanje bazne tablice smiju samo
 * service-role rubne funkcije s vlastitom provjerom uloge.
 */
describe('Korak A — nijedno novo čitanje bazne tablice project_milestones', () => {
  const READ_ALLOWLIST = new Set([
    // cron / service_role — ne prolaze kroz korisničku sesiju
    'supabase/functions/check-milestone-deadlines/index.ts',
    'supabase/functions/check-milestone-budgets/index.ts',
    // javni share link — vraća samo javna polja, bez iznosa
    'supabase/functions/get-public-project/index.ts',
    // vlastiti role gate (owner/viewer/member) unutar funkcije
    'supabase/functions/project-insights/index.ts',
  ]);

  const SCAN_ROOTS = ['src', 'supabase/functions'];
  const EXT = /\.(ts|tsx)$/;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        out.push(...walk(rel));
      } else if (EXT.test(entry.name)) {
        out.push(rel);
      }
    }
    return out;
  }

  const OCCURRENCE = /from\(\s*["']project_milestones["']\s*(?:as any\s*)?\)/g;

  it('svako čitanje ide preko project_milestones_scoped ili je na popisu', () => {
    const offenders: string[] = [];
    for (const rootDir of SCAN_ROOTS) {
      for (const file of walk(rootDir)) {
        if (file.startsWith('src/test/')) continue;
        const src = read(file);
        OCCURRENCE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = OCCURRENCE.exec(src)) !== null) {
          const tail = src.slice(m.index, m.index + 400);
          const write = tail.search(/\.(insert|update|delete|upsert)\s*\(/);
          const select = tail.search(/\.select\s*\(/);
          const isRead = select !== -1 && (write === -1 || select < write);
          if (isRead && !READ_ALLOWLIST.has(file)) {
            offenders.push(`${file} (offset ${m.index})`);
          }
        }
      }
    }
    expect(offenders, `nova izravna čitanja bazne tablice:\n${offenders.join('\n')}`).toEqual([]);
  });
});

/**
 * Točka 3 — predikat na jednom mjestu. Pogled i politika moraju zvati ISTU
 * funkciju; test pada ako se pravila ponovno inline-aju (i tiho raziđu).
 *
 * Napomena: `deleted_at IS NULL` ostaje izvan predikata jer je to filter po
 * retku pogleda (kolona), dok je politika `hide_soft_deleted` restriktivna
 * politika nad tablicom — nema zajedničkog potpisa (_project_id, _user_id).
 */
describe('Korak A — jedan predikat, dva pozivatelja', () => {
  const MIGRATIONS_DIR = 'supabase/migrations';
  const migration = (() => {
    const files = readdirSync(join(root, MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
    for (const f of files) {
      const src = read(`${MIGRATIONS_DIR}/${f}`);
      if (src.includes('CREATE OR REPLACE FUNCTION public.can_read_project_phases')) return src;
    }
    throw new Error('Nema migracije s can_read_project_phases');
  })();

  it('pogled poziva can_read_project_phases umjesto inline pravila', () => {
    const viewBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE VIEW public.project_milestones_scoped'),
    );
    expect(viewBody).toContain('public.can_read_project_phases(m.project_id, auth.uid())');
    expect(viewBody).not.toContain('is_project_participant_active(m.project_id');
    expect(viewBody.slice(0, viewBody.indexOf('REVOKE'))).not.toContain('is_projects_subscriber');
  });

  it('politika downgrade guarda poziva istu funkciju kao i predikat', () => {
    expect(migration).toMatch(
      /CREATE POLICY "project_milestones_readonly_when_downgraded"[\s\S]*?public\.projects_downgrade_ok\(project_id, auth\.uid\(\)\)/,
    );
    expect(migration).toContain(
      'public.projects_downgrade_ok(_project_id, _user_id)',
    );
  });

  it('privremene ovlasti supabase_read_only_user su povučene', () => {
    for (const fn of [
      'get_project_role(uuid, uuid)',
      'is_project_participant_active(uuid, uuid)',
      'is_projects_subscriber(uuid)',
      'get_investor_project_phases(uuid)',
    ]) {
      expect(migration).toContain(
        `REVOKE EXECUTE ON FUNCTION public.${fn} FROM supabase_read_only_user;`,
      );
    }
  });
});

