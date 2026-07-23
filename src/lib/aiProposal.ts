// Shared parser for AI proposal markers embedded in assistant messages.
// Markers are added server-side after a write tool is called; the client
// extracts them, renders a confirmation card, and shows the message text
// without the raw marker.

export interface AiProposal {
  proposal_id: string;
  action_type: 'create_savings_goal' | 'update_savings_goal' | 'create_reminder';
  summary: string;
  old_value?: unknown;
  new_value?: unknown;
}

const MARKER_RE = /\[\[AI_PROPOSAL\]\](\{[\s\S]*?\})\[\[\/AI_PROPOSAL\]\]/g;

export function parseProposalMarkers(content: string): {
  clean: string;
  proposals: AiProposal[];
} {
  if (!content || typeof content !== 'string') return { clean: content ?? '', proposals: [] };
  const proposals: AiProposal[] = [];
  const clean = content.replace(MARKER_RE, (_full, jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object' && parsed.proposal_id && parsed.action_type) {
        proposals.push(parsed as AiProposal);
      }
    } catch {
      /* ignore malformed */
    }
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { clean, proposals };
}

export function encodeProposalMarker(p: AiProposal): string {
  return `[[AI_PROPOSAL]]${JSON.stringify(p)}[[/AI_PROPOSAL]]`;
}
