import { describe, it, expect } from 'vitest';
import { buildDecisionPdfData, type BuildDecisionPdfDataInput } from '@/lib/decisionPdfExport';
import type { ProjectDecision } from '@/hooks/useProjectDecisions';
import type { DecisionAction } from '@/lib/projectDecisionStateMachine';

const labels: BuildDecisionPdfDataInput['labels'] = {
  outcome: { approved: 'Odobreno', rejected: 'Odbijeno', closed: 'Zatvoreno bez dogovora' },
  action: {
    propose: 'Prijedlog',
    counter: 'Protuprijedlog',
    correction: 'Korekcija',
    accept: 'Prihvaćeno',
    reject: 'Odbijeno',
  } as Record<DecisionAction, string>,
};

const makeDecision = (over: Partial<ProjectDecision> = {}): ProjectDecision => ({
  id: 'dec-1',
  project_id: 'p-1',
  created_by: 'owner-uid',
  title: 'Dodatna soba',
  initial_description: 'Prijedlog za dodatnu sobu.',
  initial_price: 1000,
  current_status: 'approved',
  closed_reason: 'accepted',
  closed_at: '2026-07-15T10:00:00Z',
  contract_amendment_id: 'amend-1',
  overdue: false,
  last_reminder_sent_at: null,
  created_at: '2026-07-10T08:00:00Z',
  updated_at: '2026-07-15T10:00:00Z',
  steps: [
    {
      step_no: 2,
      actor_user_id: 'inv-uid',
      actor_role: 'investor',
      action: 'counter',
      message: 'Može, ali za 1200 €.',
      price: 1200,
      created_at: '2026-07-12T09:00:00Z',
    } as any,
    {
      step_no: 1,
      actor_user_id: 'owner-uid',
      actor_role: 'owner',
      action: 'propose',
      message: 'Predlažem 1000 €.',
      price: 1000,
      created_at: '2026-07-10T08:00:00Z',
    } as any,
    {
      step_no: 3,
      actor_user_id: 'owner-uid',
      actor_role: 'owner',
      action: 'accept',
      message: null,
      price: null,
      created_at: '2026-07-15T10:00:00Z',
    } as any,
  ].map((s, i) => ({ ...s, id: `step-${(s as any).step_no}` })) as any,
  attachments: [
    {
      id: 'att-1', decision_id: 'dec-1', step_id: 'step-1',
      storage_path: 'p/1.jpg', file_name: 'skica.jpg', mime_type: 'image/jpeg',
      size_bytes: 12345, uploaded_by: 'owner-uid', created_at: '2026-07-10T08:00:00Z',
    },
    {
      id: 'att-2', decision_id: 'dec-1', step_id: 'step-2',
      storage_path: 'p/2.pdf', file_name: 'ponuda.pdf', mime_type: 'application/pdf',
      size_bytes: 50000, uploaded_by: 'inv-uid', created_at: '2026-07-12T09:00:00Z',
    },
    {
      id: 'att-orphan', decision_id: 'dec-1', step_id: null,
      storage_path: 'p/x.png', file_name: 'x.png', mime_type: 'image/png',
      size_bytes: 100, uploaded_by: 'owner-uid', created_at: '2026-07-10T08:00:00Z',
    },
  ],
  ...over,
});

const baseInput = (dec: ProjectDecision): BuildDecisionPdfDataInput => ({
  decision: dec,
  projectName: 'Kuća Marković',
  ownerName: 'Milan',
  investorName: 'Vlado',
  language: 'hr',
  labels,
  now: new Date('2026-07-16T12:00:00Z'),
});

describe('buildDecisionPdfData', () => {
  it('mapira osnovna polja', () => {
    const data = buildDecisionPdfData(baseInput(makeDecision()));
    expect(data.decisionId).toBe('dec-1');
    expect(data.projectName).toBe('Kuća Marković');
    expect(data.title).toBe('Dodatna soba');
    expect(data.ownerName).toBe('Milan');
    expect(data.investorName).toBe('Vlado');
    expect(data.language).toBe('hr');
    expect(data.generatedAt).toBe('2026-07-16T12:00:00.000Z');
  });

  it('ishod approved → outcomeLabel', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision({ current_status: 'approved' })));
    expect(d.outcome).toBe('approved');
    expect(d.outcomeLabel).toBe('Odobreno');
  });

  it('ishod rejected', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision({ current_status: 'rejected' })));
    expect(d.outcome).toBe('rejected');
    expect(d.outcomeLabel).toBe('Odbijeno');
  });

  it('ishod closed (cycle_exhausted)', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision({
      current_status: 'closed', closed_reason: 'cycle_exhausted',
    })));
    expect(d.outcome).toBe('closed');
    expect(d.outcomeLabel).toBe('Zatvoreno bez dogovora');
  });

  it('sortira korake uzlazno po step_no', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.steps.map((s) => s.stepNo)).toEqual([1, 2, 3]);
  });

  it('mapira actor imena po roli', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.steps[0].actorName).toBe('Milan');   // owner
    expect(d.steps[1].actorName).toBe('Vlado');   // investor
    expect(d.steps[2].actorName).toBe('Milan');   // owner
  });

  it('mapira action labelu', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.steps[0].actionLabel).toBe('Prijedlog');
    expect(d.steps[1].actionLabel).toBe('Protuprijedlog');
    expect(d.steps[2].actionLabel).toBe('Prihvaćeno');
  });

  it('cijena: broj ili null (accept nema cijenu)', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.steps[0].price).toBe(1000);
    expect(d.steps[1].price).toBe(1200);
    expect(d.steps[2].price).toBeNull();
  });

  it('effectivePrice = zadnja ne-null cijena po step_no', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.effectivePrice).toBe(1200);
  });

  it('hasContractAmendment true kad postoji contract_amendment_id', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.hasContractAmendment).toBe(true);
  });

  it('hasContractAmendment false kad nema amendmenta', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision({ contract_amendment_id: null })));
    expect(d.hasContractAmendment).toBe(false);
  });

  it('prilozi grupirani po koraku; orphan (step_id null) ignoriran', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.steps[0].attachments.map((a) => a.id)).toEqual(['att-1']);
    expect(d.steps[1].attachments.map((a) => a.id)).toEqual(['att-2']);
    expect(d.steps[2].attachments).toEqual([]);
    // orphan (step_id: null) ne smije se pojaviti nigdje
    const allIds = d.steps.flatMap((s) => s.attachments.map((a) => a.id));
    expect(allIds).not.toContain('att-orphan');
  });

  it('isImage detekcija po MIME tipu', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    expect(d.steps[0].attachments[0].isImage).toBe(true);   // image/jpeg
    expect(d.steps[1].attachments[0].isImage).toBe(false);  // application/pdf
  });

  it('mapira veličinu, mime i storage_path priloga', () => {
    const d = buildDecisionPdfData(baseInput(makeDecision()));
    const a = d.steps[0].attachments[0];
    expect(a.fileName).toBe('skica.jpg');
    expect(a.mimeType).toBe('image/jpeg');
    expect(a.sizeBytes).toBe(12345);
    expect(a.storagePath).toBe('p/1.jpg');
  });
});
