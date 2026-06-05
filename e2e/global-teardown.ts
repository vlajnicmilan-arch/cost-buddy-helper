import { resetUserByKey } from './helpers/db';
import { E2E_USERS, type E2EUserKey } from './helpers/env';

export default async function globalTeardown() {
  // Best-effort cleanup. Don't fail the run if reset fails — next run wipes anyway.
  const keys = Object.keys(E2E_USERS) as E2EUserKey[];
  for (const key of keys) {
    try {
      await resetUserByKey(key);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[e2e] teardown reset failed for ${key}:`, err);
    }
  }
}
