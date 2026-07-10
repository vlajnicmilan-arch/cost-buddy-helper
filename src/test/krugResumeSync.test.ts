/**
 * Krug Resume / Reconnect Sync Patch — source-level guardovi.
 *
 * Provjerava da su rupe iz Krug Offline/Reconnect audita zatvorene:
 *  - N4: Krug read hookovi imaju focus/reconnect override (per-hook, ne globalno)
 *  - N3: A3 (retract) i A7 (govern-to-personal) invalidiraju approval queue
 *  - N2: sve Krug notifikacije koje vode na `/krug` triggeriraju sync mehanizam
 *        prije `navigate()` — kroz cache invalidation `['krug']` prefix ključa
 *  - N7: `useNotifications` odrađuje resync na visibilitychange/online eventu
 *  - N8: deletion mutacije invalidiraju panel i na `onError` (nema zaleđenog UI)
 *
 * Testovi su source-level (bez React DOM) — mjerimo prisutnost pattern-a
 * koji audit traži, ne runtime ponašanje.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('Krug Resume/Reconnect Sync Patch', () => {
  describe('N4 — Krug hookovi imaju focus/reconnect override', () => {
    it('shared helper KRUG_SYNC_QUERY_OPTIONS postoji s oba flag-a', () => {
      const src = read('src/hooks/useKrugQueryOptions.ts');
      expect(src).toMatch(/KRUG_SYNC_QUERY_OPTIONS/);
      expect(src).toMatch(/refetchOnWindowFocus:\s*true/);
      expect(src).toMatch(/refetchOnReconnect:\s*true/);
    });

    it.each([
      ['src/hooks/useKrug.ts', 3], // useMyKrugs + useKrug + useKrugMembers
      ['src/hooks/useKrugPendingExpenses.ts', 1],
      ['src/hooks/useKrugDeletion.ts', 1], // useKrugDeletionRequest
    ])('%s spread-a KRUG_SYNC_QUERY_OPTIONS %s puta', (path, times) => {
      const src = read(path);
      expect(src).toMatch(/from ['"]@\/hooks\/useKrugQueryOptions['"]/);
      const matches = src.match(/\.\.\.KRUG_SYNC_QUERY_OPTIONS/g) ?? [];
      expect(matches.length).toBe(times);
    });
  });

  describe('N3 — A3/A7 invalidiraju approval queue', () => {
    it('useKrugRetract invalidira [krug, pending-expenses] u onSuccess', () => {
      const src = read('src/hooks/useKrugRetract.ts');
      expect(src).toMatch(/queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]pending-expenses['"]\s*\]/);
    });

    it('useKrugGovernToPersonal invalidira [krug, pending-expenses] u onSuccess', () => {
      const src = read('src/hooks/useKrugGovernToPersonal.ts');
      expect(src).toMatch(/queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]pending-expenses['"]\s*\]/);
    });
  });

  describe('N2 — Krug notifikacije triggeriraju sync prije navigacije', () => {
    it('useNotificationNavigation invalidira [krug] za target koji počinje s /krug', () => {
      const src = read('src/hooks/useNotificationNavigation.ts');
      expect(src).toMatch(/useQueryClient/);
      expect(src).toMatch(/target\.startsWith\(['"]\/krug['"]\)/);
      expect(src).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]krug['"]\s*\]\s*\}\)/);
    });

    it('svih 6 krug_* tipova mapira se na `/krug` — sync pokrit prefix-match check-om', () => {
      const src = read('src/lib/notificationPayload.ts');
      const types = [
        'krug_member_added',
        'krug_expense_proposed',
        'krug_expense_confirmed',
        'krug_expense_rejected',
        'krug_deletion_requested',
        'krug_deleted',
      ];
      for (const t of types) expect(src).toContain(`case '${t}':`);
      // svi vode na /krug (jedan zajednički switch case s route: '/krug')
      expect(src).toMatch(/route:\s*['"]\/krug['"]/);
    });
  });

  describe('N7 — useNotifications resync na visibility/online', () => {
    it('registrira visibilitychange i online listenere s fetchNotifications', () => {
      const src = read('src/hooks/useNotifications.ts');
      expect(src).toMatch(/addEventListener\(['"]visibilitychange['"]/);
      expect(src).toMatch(/addEventListener\(['"]online['"]/);
      expect(src).toMatch(/removeEventListener\(['"]visibilitychange['"]/);
      expect(src).toMatch(/removeEventListener\(['"]online['"]/);
      // guard protiv petlje: fetch samo kad je tab vidljiv
      expect(src).toMatch(/document\.visibilityState\s*===\s*['"]visible['"]/);
    });
  });

  describe('N8 — deletion mutacije invalidiraju i na error putu', () => {
    it('svaka od 3 deletion mutacija ima invalidate(vars.krugId) u onError', () => {
      const src = read('src/hooks/useKrugDeletion.ts');
      const onErrorBlocks = src.match(/onError:\s*\(err[^)]*,\s*vars\)\s*=>\s*\{[\s\S]*?invalidate\(vars\.krugId\)/g) ?? [];
      // useKrugRequestDeletion + useKrugVoteDeletion + useKrugCancelDeletion
      expect(onErrorBlocks.length).toBe(3);
    });
  });
});
