import { purgeSecUsersFully } from './helpers/users';
import { assertBaselineParity } from './helpers/counts';

export default async function globalTeardown(): Promise<void> {
  await purgeSecUsersFully();
  await assertBaselineParity();
}
