/**
 * Pure presentation logic for the "Poveži s postojećim članom" picker.
 *
 * Rules (see NALOG "IME RAČUNA"):
 *  - never show a raw identifier (uuid) to the user;
 *  - the e-mail may only come from an invitation the CURRENT owner sent;
 *  - an account already linked to ANOTHER person is disabled, not hidden.
 */

export interface MemberChoiceSource {
  userId: string;
  displayName?: string | null;
  /** Owner projects where this account holds a membership. */
  projectIds: string[];
  /** E-mail from an invitation sent by the current owner — otherwise null. */
  invitedEmail?: string | null;
  /** ISO date of that invitation, used when there is no name at all. */
  invitedAt?: string | null;
  /** Person (Ljudi) that already carries this account, if any. */
  linkedPersonId?: string | null;
  linkedPersonName?: string | null;
}

export interface MemberChoice {
  userId: string;
  /** Human name, or null when the account has none. */
  name: string | null;
  /** E-mail allowed to be shown, or null. */
  email: string | null;
  /** Project names (resolved, deduped, sorted). */
  projects: string[];
  invitedAt: string | null;
  disabled: boolean;
  /** Person name blocking the choice (only when disabled). */
  blockedByPersonName: string | null;
}

export interface InvitationRow {
  invited_user_id?: string | null;
  invited_by?: string | null;
  email?: string | null;
  created_at?: string | null;
}

/** E-mails visible to the owner: only invitations the owner sent himself. */
export function ownInvitationEmails(
  invitations: readonly InvitationRow[],
  ownerUserId: string,
): Map<string, { email: string; invitedAt: string | null }> {
  const out = new Map<string, { email: string; invitedAt: string | null }>();
  for (const inv of invitations) {
    if (!inv?.invited_user_id || !inv.email) continue;
    if (inv.invited_by !== ownerUserId) continue;
    const prev = out.get(inv.invited_user_id);
    const at = inv.created_at ?? null;
    if (!prev || (at && prev.invitedAt && at > prev.invitedAt) || (at && !prev.invitedAt)) {
      out.set(inv.invited_user_id, { email: inv.email, invitedAt: at });
    }
  }
  return out;
}

export function buildMemberChoices(
  sources: readonly MemberChoiceSource[],
  projectNames: Record<string, string>,
  currentPersonId: string,
): MemberChoice[] {
  return sources.map((s) => {
    const name = (s.displayName ?? '').trim() || null;
    const email = (s.invitedEmail ?? '').trim() || null;
    const projects = Array.from(new Set(s.projectIds.filter(Boolean)))
      .map((id) => projectNames[id])
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b));
    const blocked = !!s.linkedPersonId && s.linkedPersonId !== currentPersonId;
    return {
      userId: s.userId,
      name,
      email,
      projects,
      invitedAt: s.invitedAt ?? null,
      disabled: blocked,
      blockedByPersonName: blocked ? (s.linkedPersonName ?? null) : null,
    };
  });
}

export interface MemberChoiceLabels {
  /** e.g. "Bez imena" */
  noName: string;
  /** e.g. "Bez imena · pozvan {date}" already formatted by the caller */
  noNameInvited?: (date: string) => string;
  formatDate?: (iso: string) => string;
}

/** Primary line. NEVER returns the raw user id. */
export function memberChoiceLabel(choice: MemberChoice, labels: MemberChoiceLabels): string {
  if (choice.name) return choice.name;
  if (choice.email) return choice.email;
  if (choice.invitedAt && labels.noNameInvited) {
    const date = labels.formatDate ? labels.formatDate(choice.invitedAt) : choice.invitedAt;
    return labels.noNameInvited(date);
  }
  return labels.noName;
}

/** Secondary line: projects, plus e-mail when it is not already the label. */
export function memberChoiceContext(choice: MemberChoice): string {
  const parts: string[] = [];
  if (choice.email && choice.name) parts.push(choice.email);
  if (choice.projects.length > 0) parts.push(choice.projects.join(' · '));
  return parts.join(' · ');
}
