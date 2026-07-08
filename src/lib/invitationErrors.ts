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
 *   showError(invitationErrorMessage(data.error, t, data.message));
 */
import type { TFunc } from '@/lib/errorMessages';

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
 * invitation error string.
 */
export function invitationErrorMessage(
  code: string | null | undefined,
  t: TFunc,
  serverMessage?: string | null,
): string {
  if (code && code in KEY_MAP) {
    const key = KEY_MAP[code as InvitationErrorCode];
    return t(key);
  }
  if (serverMessage && serverMessage.trim()) return serverMessage;
  return t('invitations.errors.generic');
}
