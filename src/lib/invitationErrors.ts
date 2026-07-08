/**
 * Central mapping from send-member-invitation edge function error codes
 * (WS3a-2 refactor) to localized user messages.
 *
 * Edge functions return `data.error = '<code>'` in the response body when
 * the invitation is rejected. Callers should surface a friendly localized
 * message instead of the raw code.
 *
 * Usage:
 *   import { invitationErrorMessage } from '@/lib/invitationErrors';
 *   showError(invitationErrorMessage(data.error, data.message));
 */
import { tr } from '@/lib/errorMessages';

export type InvitationErrorCode =
  | 'user_not_found'
  | 'already_member'
  | 'already_invited'
  | 'project_closed'
  | 'invalid_email'
  | 'project_not_found';

const KEY_MAP: Record<InvitationErrorCode, string> = {
  user_not_found: 'invitations.errors.userNotFound',
  already_member: 'invitations.errors.alreadyMember',
  already_invited: 'invitations.errors.alreadyInvited',
  project_closed: 'invitations.errors.projectClosed',
  invalid_email: 'invitations.errors.invalidEmail',
  project_not_found: 'invitations.errors.projectNotFound',
};

/**
 * Returns a localized message for an invitation error code.
 * Falls back to `serverMessage` (server-provided text) or the generic
 * invitation error string. Uses the global i18n instance so it works in
 * hooks and non-React code paths.
 */
export function invitationErrorMessage(
  code: string | null | undefined,
  serverMessage?: string | null,
): string {
  if (code && code in KEY_MAP) {
    return tr(KEY_MAP[code as InvitationErrorCode]);
  }
  if (serverMessage && serverMessage.trim()) return serverMessage;
  return tr('invitations.errors.generic');
}
