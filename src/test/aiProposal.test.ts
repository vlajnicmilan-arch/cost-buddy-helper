import { describe, it, expect } from 'vitest';
import { parseProposalMarkers, encodeProposalMarker, type AiProposal } from '@/lib/aiProposal';

describe('aiProposal', () => {
  const sample: AiProposal = {
    proposal_id: 'abc-123',
    action_type: 'create_savings_goal',
    summary: 'Cilj: Auto — 5000 € do 30.6.',
    new_value: { name: 'Auto', target_amount: 5000 },
  };

  it('extracts one proposal and strips marker', () => {
    const raw = `OK, evo prijedloga.\n\n${encodeProposalMarker(sample)}`;
    const { clean, proposals } = parseProposalMarkers(raw);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].proposal_id).toBe('abc-123');
    expect(clean).toBe('OK, evo prijedloga.');
    expect(clean).not.toContain('AI_PROPOSAL');
  });

  it('extracts multiple proposals', () => {
    const p2 = { ...sample, proposal_id: 'x-2' };
    const raw = `${encodeProposalMarker(sample)}\ntext\n${encodeProposalMarker(p2)}`;
    const { proposals } = parseProposalMarkers(raw);
    expect(proposals.map((p) => p.proposal_id)).toEqual(['abc-123', 'x-2']);
  });

  it('returns empty proposals on plain text', () => {
    const { clean, proposals } = parseProposalMarkers('Samo tekst.');
    expect(proposals).toEqual([]);
    expect(clean).toBe('Samo tekst.');
  });

  it('ignores malformed marker json', () => {
    const raw = 'Hej [[AI_PROPOSAL]]{not-json[[/AI_PROPOSAL]] kraj';
    const { proposals, clean } = parseProposalMarkers(raw);
    expect(proposals).toEqual([]);
    expect(clean).toBe('Hej  kraj');
  });

  it('handles empty/null input safely', () => {
    expect(parseProposalMarkers('').proposals).toEqual([]);
    expect(parseProposalMarkers(null as unknown as string).proposals).toEqual([]);
  });
});
