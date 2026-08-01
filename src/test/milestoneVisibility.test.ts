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
