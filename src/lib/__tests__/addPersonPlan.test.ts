import { describe, it, expect } from 'vitest';
import {
  buildAddPersonPlan,
  engagementInsertPayload,
  inheritedDefaults,
} from '@/lib/addPersonPlan';

const form = (selections: { projectId: string; hourlyRate: string; position: string }[]) => ({
  firstName: 'Ivo',
  lastName: 'Ivić',
  selections,
});

describe('buildAddPersonPlan', () => {
  it('jedna osoba + tri projekta daje tri angažmana i točno jednu osobu', () => {
    const plan = buildAddPersonPlan(
      form([
        { projectId: 'p1', hourlyRate: '7', position: 'Radnik' },
        { projectId: 'p2', hourlyRate: '7', position: 'Radnik' },
        { projectId: 'p3', hourlyRate: '6', position: 'Majstor' },
      ]),
    );
    expect(plan.valid).toBe(true);
    expect(plan.createsPerson).toBe(true);
    expect(plan.engagements).toHaveLength(3);
  });

  it('različite satnice po projektu se sačuvaju (7, 7, 6)', () => {
    const plan = buildAddPersonPlan(
      form([
        { projectId: 'p1', hourlyRate: '7', position: 'Radnik' },
        { projectId: 'p2', hourlyRate: '7,00', position: 'Radnik' },
        { projectId: 'p3', hourlyRate: '6', position: 'Radnik' },
      ]),
    );
    expect(plan.engagements.map((e) => e.hourlyRate)).toEqual([7, 7, 6]);
    expect(plan.engagements.every((e) => e.rateProvided)).toBe(true);
  });

  it('odabir postojeće osobe ne stvara novi redak u workers', () => {
    const plan = buildAddPersonPlan(form([{ projectId: 'p1', hourlyRate: '7', position: 'Radnik' }]), {
      existingWorkerId: 'w-1',
    });
    expect(plan.createsPerson).toBe(false);
    expect(plan.existingWorkerId).toBe('w-1');
    expect(engagementInsertPayload(plan, plan.engagements[0], 'w-1').worker_id).toBe('w-1');
  });

  it('prazna satnica se sprema kao 0 i označava kao "nije upisana"', () => {
    const plan = buildAddPersonPlan(form([{ projectId: 'p1', hourlyRate: '', position: 'Radnik' }]));
    expect(plan.valid).toBe(true);
    expect(plan.engagements[0].hourlyRate).toBe(0);
    expect(plan.engagements[0].rateProvided).toBe(false);
    const zero = buildAddPersonPlan(form([{ projectId: 'p1', hourlyRate: '0', position: 'Radnik' }]));
    expect(zero.engagements[0].rateProvided).toBe(true);
  });

  it('bez odabranog projekta plan je prazan i spremanje se ne pokreće', () => {
    const plan = buildAddPersonPlan(form([]));
    expect(plan.valid).toBe(false);
    expect(plan.engagements).toEqual([]);
  });

  it('bez imena ili prezimena plan nije valjan', () => {
    const plan = buildAddPersonPlan({
      firstName: ' ',
      lastName: 'Ivić',
      selections: [{ projectId: 'p1', hourlyRate: '7', position: 'Radnik' }],
    });
    expect(plan.valid).toBe(false);
  });

  it('duplirani projekt se ne upisuje dvaput', () => {
    const plan = buildAddPersonPlan(
      form([
        { projectId: 'p1', hourlyRate: '7', position: 'Radnik' },
        { projectId: 'p1', hourlyRate: '9', position: 'Majstor' },
      ]),
    );
    expect(plan.engagements).toHaveLength(1);
    expect(plan.engagements[0].hourlyRate).toBe(7);
  });

  it('payload za angažman ne spominje prava pristupa i drži zadano radno vrijeme', () => {
    const plan = buildAddPersonPlan(form([{ projectId: 'p1', hourlyRate: '7', position: 'Radnik' }]));
    const payload = engagementInsertPayload(plan, plan.engagements[0], 'w-9');
    expect(payload).toMatchObject({
      project_id: 'p1',
      worker_id: 'w-9',
      first_name: 'Ivo',
      last_name: 'Ivić',
      position: 'Radnik',
      hourly_rate: 7,
      work_start_time: '08:00',
      work_end_time: '16:00',
    });
    expect(Object.keys(payload)).not.toContain('role');
  });

  it('novi redak nasljeđuje vrijednosti prvog ispunjenog retka', () => {
    expect(
      inheritedDefaults([
        { projectId: 'p1', hourlyRate: '7', position: 'Radnik' },
        { projectId: 'p2', hourlyRate: '', position: '' },
      ]),
    ).toEqual({ hourlyRate: '7', position: 'Radnik' });
    expect(inheritedDefaults([])).toEqual({ hourlyRate: '', position: '' });
  });
});
