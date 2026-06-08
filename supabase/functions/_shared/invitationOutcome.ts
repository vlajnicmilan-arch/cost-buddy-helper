/**
 * Pure decision logic for send-member-invitation.
 * Extracted to enable regression tests without mocking Supabase chains.
 *
 * Edge function does all DB lookups, then calls classifyInvitationOutcome()
 * with the resulting flags. The outcome string maps 1:1 to the response
 * `error` field returned by the edge function.
 */

export type InvitationType = "project" | "budget" | "payment_source";

export type InvitationOutcome =
  | "ok"
  | "invalid_email"
  | "project_closed"
  | "user_not_found"
  | "already_member"
  | "already_invited";

export interface InvitationInput {
  type: InvitationType;
  invitedEmail: string;
  invitedUserExists: boolean;
  workerId?: string | null;
  sendEmail?: boolean;
  isAlreadyMember: boolean;
  hasPendingInviteByUserId: boolean;
  hasPendingInviteByEmail: boolean;
  project?: { archived: boolean; status: string } | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSED_PROJECT_STATUSES = new Set(["completed", "cancelled"]);

export function isValidInvitationEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function classifyInvitationOutcome(input: InvitationInput): InvitationOutcome {
  if (!isValidInvitationEmail(input.invitedEmail)) {
    return "invalid_email";
  }

  if (input.type === "project" && input.project) {
    if (input.project.archived || CLOSED_PROJECT_STATUSES.has(input.project.status)) {
      return "project_closed";
    }
  }

  // Email-only project worker invites are allowed when user doesn't exist yet.
  const allowEmailOnly =
    input.type === "project" && (Boolean(input.workerId) || Boolean(input.sendEmail));

  if (!input.invitedUserExists && !allowEmailOnly) {
    return "user_not_found";
  }

  if (input.invitedUserExists) {
    if (input.isAlreadyMember) return "already_member";
    if (input.hasPendingInviteByUserId) return "already_invited";
  } else {
    if (input.hasPendingInviteByEmail) return "already_invited";
  }

  return "ok";
}
