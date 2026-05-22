/**
 * Resolve notification title/message strings that may be stored as i18n keys.
 *
 * Some notifications (e.g. issue reconciler — budget_burn, project_loss_zone,
 * overdue_invoice) intentionally store i18n keys in `notifications.title` /
 * `notifications.message` with variables in `data.title_vars` / `data.message_vars`.
 * This lets translations follow the user's current language without backfilling DB rows.
 *
 * Other notifications store already-localized text. This helper detects which is which.
 */
import i18n from "@/i18n";
import type { TFunction } from "i18next";

const KEY_PATTERN = /^[a-zA-Z][\w-]*(\.[\w-]+)+$/;

export const resolveNotificationText = (
  raw: string | null | undefined,
  vars: Record<string, unknown> | undefined,
  t: TFunction,
): string => {
  if (!raw) return "";
  if (!KEY_PATTERN.test(raw)) return raw;
  if (!i18n.exists(raw)) return raw;
  return t(raw, (vars ?? {}) as Record<string, unknown>);
};
