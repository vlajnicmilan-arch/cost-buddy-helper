import { mkdir } from 'node:fs/promises';
import { ensureBothSecUsers } from './helpers/users';
import { writeBaseline } from './helpers/counts';

export default async function globalSetup(): Promise<void> {
  await mkdir('e2e/security/.artifacts', { recursive: true });
  await writeBaseline();
  const { aId, bId } = await ensureBothSecUsers();
  // eslint-disable-next-line no-console
  console.log('[security] users ready:', { aId, bId });
}
