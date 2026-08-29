// Pure helpers for the "new signup" admin notification.
// No I/O here so the logic can be unit-tested from the vitest suite.

export interface SignupUtm {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

/** Max number of individual (non-summarised) notices per admin per day. */
export const MAX_INDIVIDUAL_PER_DAY = 5;

const SOURCE_LABELS: Record<string, string> = {
  facebook: "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  ig: "Instagram",
  google: "Google",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  newsletter: "Newsletter",
  email: "E-mail",
};

const MEDIUM_LABELS: Record<string, string> = {
  cpc: "plaćeni oglas",
  ppc: "plaćeni oglas",
  paid: "plaćeni oglas",
  paid_social: "plaćeni oglas",
  organic: "organski",
  social: "društvene mreže",
  referral: "preporuka",
  email: "e-mail",
};

const clean = (v?: string | null): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  return t;
};

const label = (map: Record<string, string>, v: string): string =>
  map[v.toLowerCase()] ?? v;

/** Human readable traffic source, "izravno" when nothing is known. */
export function formatSignupSource(utm: SignupUtm | null | undefined): string {
  const source = clean(utm?.utm_source);
  const medium = clean(utm?.utm_medium);
  const campaign = clean(utm?.utm_campaign);

  if (!source && !medium && !campaign) return "izravno";

  const parts: string[] = [];
  if (source) parts.push(label(SOURCE_LABELS, source));
  if (medium) parts.push(label(MEDIUM_LABELS, medium));
  if (campaign) parts.push(campaign);
  return parts.join(", ");
}

/** Extracts UTM tags from a funnel_events.metadata payload. */
export function extractUtm(metadata: unknown): SignupUtm {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
  return {
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign"),
  };
}

export function formatLocalTime(iso: string, timeZone = "Europe/Zagreb"): string {
  try {
    return new Intl.DateTimeFormat("hr-HR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/** In-app message body: name (or "bez imena") · time · source. */
export function buildSignupMessage(args: {
  displayName?: string | null;
  occurredAt: string;
  source: string;
  timeZone?: string;
}): string {
  const name = clean(args.displayName) ?? "bez imena";
  return `${name} · ${formatLocalTime(args.occurredAt, args.timeZone)} · ${args.source}`;
}

/**
 * Push text must stay privacy-safe: no name, no e-mail on the lock screen.
 */
export function buildSignupPushBody(source: string): string {
  return `Nova registracija · ${source}`;
}

export type SignupDeliveryMode = "individual" | "summary_new" | "summary_update";

export interface SignupDelivery {
  mode: SignupDeliveryMode;
  push: boolean;
}

/**
 * @param priorIndividualToday how many individual notices the admin already got today
 * @param summaryExists whether today's summary notification already exists
 */
export function decideSignupDelivery(
  priorIndividualToday: number,
  summaryExists: boolean,
): SignupDelivery {
  if (priorIndividualToday < MAX_INDIVIDUAL_PER_DAY) {
    return { mode: "individual", push: true };
  }
  if (!summaryExists) return { mode: "summary_new", push: true };
  return { mode: "summary_update", push: false };
}

export function summaryDedupKey(dayIso: string): string {
  return `admin_new_signup_summary:${dayIso}`;
}

export function buildSummaryMessage(extraCount: number): string {
  if (extraCount === 1) return "još 1 registracija danas";
  if (extraCount >= 2 && extraCount <= 4) return `još ${extraCount} registracije danas`;
  return `još ${extraCount} registracija danas`;
}
