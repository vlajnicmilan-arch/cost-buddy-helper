/**
 * Modul "Odluke" — Faza 4: čista logika za odabir akcija podsjetnika.
 * Izdvojena da bi bila testabilna neovisno o edge okruženju.
 *
 * Pragovi (fiksni, po odluci vlasnika):
 *  - FIRST_REMINDER_MS: 12h → jednokratni podsjetnik strani na redu (ako još ništa nije poslano)
 *  - OVERDUE_MS: 24h → oznaka overdue + push obavijest OBJEMA stranama
 *  - DAILY_REMINDER_MS: 24h → dnevni podsjetnik strani na redu (kad je odluka overdue)
 *
 * BEZ auto-zatvaranja pod bilo kojim uvjetom.
 */

export const FIRST_REMINDER_MS = 12 * 60 * 60 * 1000;
export const OVERDUE_MS = 24 * 60 * 60 * 1000;
export const DAILY_REMINDER_MS = 24 * 60 * 60 * 1000;

export type ReminderAction =
  | 'first_reminder'   // >12h bez podsjetnika → poslati jednokratni
  | 'mark_overdue'     // >24h a još nije overdue → postaviti overdue + push obojici
  | 'daily_reminder';  // overdue i zadnji podsjetnik stariji od 24h (ili nikad) → dnevni

export interface ReminderInput {
  now: Date;
  /** Kada je zadnja aktivnost (zadnji korak). Koristimo `updated_at` odluke — after-trigger je resetira. */
  lastActivityAt: Date;
  overdue: boolean;
  lastReminderSentAt: Date | null;
}

/**
 * Vrati listu akcija koje treba izvršiti u ovom ticku (moguće više odjednom
 * ako je decision dugo mirovala). Redoslijed u listi je logički:
 * mark_overdue prije daily_reminder.
 */
export function decideReminderActions(input: ReminderInput): ReminderAction[] {
  const { now, lastActivityAt, overdue, lastReminderSentAt } = input;
  const sinceActivity = now.getTime() - lastActivityAt.getTime();
  const actions: ReminderAction[] = [];

  if (!overdue && sinceActivity >= OVERDUE_MS) {
    actions.push('mark_overdue');
    actions.push('daily_reminder');
    return actions;
  }

  if (!overdue && sinceActivity >= FIRST_REMINDER_MS && lastReminderSentAt === null) {
    actions.push('first_reminder');
    return actions;
  }

  if (overdue) {
    const sinceReminder = lastReminderSentAt
      ? now.getTime() - lastReminderSentAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (sinceReminder >= DAILY_REMINDER_MS) {
      actions.push('daily_reminder');
    }
  }

  return actions;
}
