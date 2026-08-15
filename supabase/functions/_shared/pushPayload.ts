import { translate } from "./i18n/index.ts";

export interface PushTextData {
  i18n_title_key?: unknown;
  i18n_body_key?: unknown;
  title_vars?: unknown;
  message_vars?: unknown;
  [key: string]: unknown;
}

export interface I18nPushArgs {
  user_id: string;
  title: string;
  body: string;
  data: PushTextData;
  source: string;
}

const I18N_KEY = /^[a-zA-Z][\w-]*(\.[\w-]+)+$/;

const vars = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

/** Jedini ugovor za edge funkcije koje šalju key+vars push. */
export function buildI18nPushArgs(input: {
  userId: string;
  titleKey: string;
  bodyKey: string;
  titleVars?: Record<string, unknown>;
  messageVars?: Record<string, unknown>;
  data?: Record<string, unknown>;
  source: string;
}): I18nPushArgs {
  return {
    user_id: input.userId,
    title: input.titleKey,
    body: input.bodyKey,
    source: input.source,
    data: {
      ...(input.data ?? {}),
      i18n_title_key: input.titleKey,
      i18n_body_key: input.bodyKey,
      title_vars: input.titleVars ?? {},
      message_vars: input.messageVars ?? {},
    },
  };
}

/**
 * Posljednja brana prije FCM-a. Svaki sender završava u send-push pa ovdje
 * vrijedi isti ugovor i za shared helper i za izravne invoke/fetch pozive.
 */
export function resolvePushText(input: {
  lang: string;
  title: string;
  body: string;
  data?: PushTextData | null;
}): { title: string; body: string } {
  const data = input.data ?? {};
  const titleKey = typeof data.i18n_title_key === "string" ? data.i18n_title_key : null;
  const bodyKey = typeof data.i18n_body_key === "string" ? data.i18n_body_key : null;

  if (I18N_KEY.test(input.title) && !titleKey) {
    throw new Error(`raw_i18n_title:${input.title}`);
  }
  if (I18N_KEY.test(input.body) && !bodyKey) {
    throw new Error(`raw_i18n_body:${input.body}`);
  }

  const title = titleKey ? translate(input.lang, titleKey, vars(data.title_vars)) : input.title;
  const body = bodyKey ? translate(input.lang, bodyKey, vars(data.message_vars)) : input.body;

  if (I18N_KEY.test(title) || I18N_KEY.test(body)) {
    throw new Error(`unresolved_i18n_key:${I18N_KEY.test(title) ? title : body}`);
  }
  return { title, body };
}