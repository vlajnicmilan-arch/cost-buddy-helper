// A7 — nazivlje osoba i dokumenata je GLOBALNO i ne ovisi o vrsti projekta.
// Samo naziv faza (milestones) smije varirati po vrsti.
import { describe, it, expect } from 'vitest';
import { getProjectTypeLabels } from '@/hooks/useProjectTypeLabels';
import { PROJECT_TYPE_PRESETS } from '@/lib/projectTypes';
import hr from '@/i18n/locales/hr.json';

const lookup = (key: string, fallback?: string): string => {
  const value = key.split('.').reduce<any>((acc, part) => (acc == null ? undefined : acc[part]), hr as any);
  if (typeof value === 'string') return value;
  return fallback ?? key;
};

describe('getProjectTypeLabels', () => {
  const baseline = getProjectTypeLabels('general', lookup);

  it('vraća iste nazive za members/workers/collaborators/documents za SVAKU vrstu', () => {
    for (const preset of PROJECT_TYPE_PRESETS) {
      const labels = getProjectTypeLabels(preset.id, lookup);
      expect(labels.membersLabel).toBe(baseline.membersLabel);
      expect(labels.workersLabel).toBe(baseline.workersLabel);
      expect(labels.collaboratorsLabel).toBe(baseline.collaboratorsLabel);
      expect(labels.documentsLabel).toBe(baseline.documentsLabel);
    }
  });

  it('koristi hrvatska globalna imena Članovi · Ljudi · Suradnici · Dokumenti', () => {
    expect(baseline.membersLabel).toBe('Članovi');
    expect(baseline.workersLabel).toBe('Ljudi');
    expect(baseline.collaboratorsLabel).toBe('Suradnici');
    expect(baseline.documentsLabel).toBe('Dokumenti');
  });

  it('dopušta različit naziv faza po vrsti', () => {
    expect(getProjectTypeLabels('renovation', lookup).milestonesLabel).toBe('Faze radova');
    expect(getProjectTypeLabels('it_software', lookup).milestonesLabel).toBe('Sprintovi');
    expect(getProjectTypeLabels('general', lookup).milestonesLabel).not.toBe('Sprintovi');
  });

  it('registar vrsta više ne sadrži nazive za osobe ni dokumente', () => {
    for (const preset of PROJECT_TYPE_PRESETS) {
      expect(Object.keys(preset.labelKeys).every((k) => k === 'milestones')).toBe(true);
    }
    const raw = JSON.stringify((hr as any).projectTypes);
    for (const dead of ['"workers"', '"collaborators"', '"documents"', '"members"']) {
      expect(raw.includes(dead)).toBe(false);
    }
  });
});
