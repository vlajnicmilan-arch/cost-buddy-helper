// Composes the participant-digest push/bell body.
//
// Event `kind` values are code strings produced by the notifier functions
// (notify-project-activity, notify-project-transaction, notify-pending-transaction,
// notify-note-added, check-milestone-budgets). They are ALWAYS translated through
// the shared server catalog before reaching the user; an unknown kind falls back to
// the generic "change" label so a raw snake_case token can never leak into UI text.
import { translate } from "./i18n/index.ts";

export const DIGEST_EVENT_KINDS = [
  "work_log_added",
  "work_log_updated",
  "work_log_deleted",
  "milestone_added",
  "milestone_status_changed",
  "milestone_deleted",
  "project_transaction_created",
  "project_transaction_updated",
  "pending_transaction_created",
  "project_note_added",
  "milestone_budget_warning",
  "milestone_budget_over",
  "test_event",
] as const;

export type DigestEventKind = (typeof DIGEST_EVENT_KINDS)[number];

const KNOWN = new Set<string>(DIGEST_EVENT_KINDS);

export function digestKindLabel(lang: string | null | undefined, kind: string | null): string {
  const key = kind && KNOWN.has(kind)
    ? `notifications.digest_kind.${kind}`
    : "notifications.digest_kind.unknown";
  return translate(lang, key);
}

export interface DigestBodySelection {
  key: string;
  vars: Record<string, unknown>;
}

/** Croatian needs one/few/other; en+de collapse few into other. */
export function pluralForm(lang: string, count: number): "single" | "few" | "many" {
  if (lang !== "hr") return count === 1 ? "single" : "many";
  const mod100 = Math.abs(count) % 100;
  const mod10 = Math.abs(count) % 10;
  if (mod100 >= 11 && mod100 <= 14) return "many";
  if (mod10 === 1) return "single";
  if (mod10 >= 2 && mod10 <= 4) return "few";
  return "many";
}

export function buildSummaryBodySelection(
  count: number,
  summary: unknown[],
  lang: string = "hr",
): DigestBodySelection {
  if (count <= 0) {
    return { key: "notifications.participant_digest.body.empty", vars: {} };
  }

  let samples = "";
  if (Array.isArray(summary) && summary.length > 0) {
    const parts = summary
      .slice(0, 3)
      .map((evt) => {
        if (typeof evt === "string") return evt;
        const obj = evt as Record<string, unknown>;
        const actor = typeof obj.actor_name === "string" ? obj.actor_name : null;
        const kind = typeof obj.kind === "string" ? obj.kind : null;
        const label = typeof obj.label === "string" ? obj.label : null;
        const parts2 = [actor, digestKindLabel(lang, kind), label].filter(Boolean);
        return parts2.length > 0 ? parts2.join(" · ") : null;
      })
      .filter((s): s is string => !!s);
    if (parts.length > 0) {
      samples = `${parts.join("; ")}${count > parts.length ? "…" : ""}`;
    }
  }

  const form = pluralForm(lang, count);
  const suffix = samples ? "with_samples" : "no_samples";
  return {
    key: `notifications.participant_digest.body.${form}_${suffix}`,
    vars: samples ? { count, samples } : { count },
  };
}
