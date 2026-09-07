/**
 * Signup intent — namjera s kojom je korisnik došao na registraciju.
 *
 * Dva izvora, oba čitamo bez side-effecta:
 *  1. `user.user_metadata.signup_intent` — upisano pri e-mail registraciji
 *     (vezano uz RAČUN, preživi potvrdu maila i drugi uređaj).
 *  2. `authEntry.entry_path` — sessionStorage atribucija landing CTA-a
 *     (rezerva za Google/Apple prijavu u istom tabu).
 */

export type SignupIntent = 'projects' | 'finance';

export const PROJECTS_ENTRY_PREFIX = '/projekti';

interface IntentUserLike {
  user_metadata?: { signup_intent?: unknown } | null;
}

interface IntentEntryLike {
  entry_path?: unknown;
}

export const resolveSignupIntent = (
  user?: IntentUserLike | null,
  authEntry?: IntentEntryLike | null,
): SignupIntent => {
  if (user?.user_metadata?.signup_intent === 'projects') return 'projects';
  const path = authEntry?.entry_path;
  if (typeof path === 'string' && path.startsWith(PROJECTS_ENTRY_PREFIX)) return 'projects';
  return 'finance';
};
