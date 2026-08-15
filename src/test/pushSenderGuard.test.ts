import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
});

describe('sustavna push brana', () => {
  it('svaki FCM put završava u send-push, koji zove resolvePushText prije notification payload-a', () => {
    const files = walk('supabase/functions');
    const directFcmSenders = files.filter((file) => {
      if (file.endsWith('send-push/index.ts')) return false;
      const src = readFileSync(file, 'utf8');
      return src.includes('fcm.googleapis.com') || src.includes('notification: { title, body }');
    });
    expect(directFcmSenders).toEqual([]);

    const sender = readFileSync('supabase/functions/send-push/index.ts', 'utf8');
    expect(sender.indexOf('resolvePushText({')).toBeGreaterThan(-1);
    expect(sender.indexOf('resolvePushText({')).toBeLessThan(sender.indexOf('notification: { title, body }'));
  });
});