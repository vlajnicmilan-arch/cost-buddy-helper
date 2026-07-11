/**
 * WS — Krug Realtime + Invalidation Patch.
 *
 * Source-level guardovi koji dokazuju da otvoreni Krug reagira na server
 * promjene bez focus/reconnect trika, i da role change invalidira sve
 * surface-e koji ovise o `myMembership` / `isFullMember`.
 *
 * Runtime realtime ponašanje se ne mock-a (Supabase Realtime WS + JWT stack
 * nije jeftin za mock). Testiramo prisutnost obrasca — kanal + tablica +
 * filter + invalidacija — što je i pattern koji je audit tražio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('Krug Realtime + Invalidation Patch', () => {
  describe('Realtime wiring — read hookovi', () => {
    it('useKrug (detail) prati `krug` i `krug_membership` filtrirano po krugId', () => {
      const src = read('src/hooks/useKrug.ts');
      // useEffect + supabase.channel + removeChannel cleanup
      expect(src).toMatch(/useEffect/);
      expect(src).toMatch(/\.channel\(`krug-detail-\$\{krugId\}/);
      expect(src).toMatch(/removeChannel/);
      // krug UPDATE (soft-delete / rename) filtriran po id
      expect(src).toMatch(/table:\s*['"]krug['"][^}]*filter:\s*`id=eq\.\$\{krugId\}`/);
      // krug_membership po krug_id (upgrade/downgrade role, add/remove)
      expect(src).toMatch(/table:\s*['"]krug_membership['"][^}]*filter:\s*`krug_id=eq\.\$\{krugId\}`/);
      // membership promjena mora invalidirati i pending-expenses (isFullMember gate)
      expect(src).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]pending-expenses['"]\s*,\s*krugId\s*\]\s*\}\)/);
    });

    it('useMyKrugs prati `krug` publikaciju i invalidira my-list', () => {
      const src = read('src/hooks/useKrug.ts');
      expect(src).toMatch(/\.channel\(`krug-my-\$\{user\.id\}`\)/);
      expect(src).toMatch(/table:\s*['"]krug['"]/);
      expect(src).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]my['"]\s*\]\s*\}\)/);
    });

    it('useMyKrugs dodatno prati `krug_membership` filtriran po user_id (membership-driven ulaz/izlaz iz liste)', () => {
      const src = read('src/hooks/useKrug.ts');
      // Isti kanal `krug-my-<user.id>` mora imati i drugu .on() pretplatu
      // na krug_membership, filtriranu po user_id=eq.<me>, jer membership
      // promjena ne mijenja red u `krug` i inače ne bi propagirala u listu.
      expect(src).toMatch(/table:\s*['"]krug_membership['"][^}]*filter:\s*`user_id=eq\.\$\{user\.id\}`/);
    });

    it('useMyKrugs NEMA broadcast slušač za krug_deleted (jedini recipient je Krug.tsx)', () => {
      const src = read('src/hooks/useKrug.ts');
      // Ne smije postojati broadcast pretplata (na bilo kojem topicu) unutar useKrug.ts
      expect(src).not.toMatch(/'broadcast'\s*,\s*\{\s*event:\s*['"]krug_deleted['"]/);
      // Ne smije se pojaviti stari mrtvi kanal
      expect(src).not.toMatch(/krug-user-deletions-/);
    });

    it('Broadcast slušač za krug_deleted postoji ISKLJUČIVO u src/pages/Krug.tsx', () => {
      const { readdirSync, statSync } = require('fs');
      const roots = ['src/hooks', 'src/components', 'src/pages'];
      const hits: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(resolve(__dirname, '..', '..', dir))) {
          const rel = `${dir}/${entry}`;
          const abs = resolve(__dirname, '..', '..', rel);
          if (statSync(abs).isDirectory()) { walk(rel); continue; }
          if (!/\.(ts|tsx)$/.test(entry)) continue;
          const src = read(rel);
          if (/event:\s*['"]krug_deleted['"]/.test(src)) hits.push(rel);
        }
      };
      roots.forEach(walk);
      expect(hits).toEqual(['src/pages/Krug.tsx']);
    });


    it('DB trigger emitira `krug_deleted` broadcast na per-user topic (P0 Hotfix B)', () => {
      const { readdirSync } = require('fs');
      const migrations = readdirSync(resolve(__dirname, '..', '..', 'supabase/migrations'));
      const hits = migrations
        .filter((f: string) => f.endsWith('.sql'))
        .map((f: string) => read(`supabase/migrations/${f}`))
        .filter((s: string) => s.includes('krug_broadcast_soft_delete'));
      expect(hits.length, 'no migration installs krug_broadcast_soft_delete').toBeGreaterThan(0);
      const src = hits.join('\n');
      expect(src).toMatch(/realtime\.send\(/);
      expect(src).toMatch(/'krug_deleted'/);
      expect(src).toMatch(/krug:user:/);
      expect(src).toMatch(/AFTER UPDATE OF deleted_at ON public\.krug/);
    });

    it('Krug page ima page-level broadcast koji resetira selectedKrugId (P0 Hotfix B follow-up)', () => {
      const src = read('src/pages/Krug.tsx');
      // Page-level kanal (drukčiji topic da se ne pomiješa s useMyKrugs)
      // Topic MORA odgovarati DB trigeru `realtime.send(..., 'krug:user:<uid>')`
      expect(src).toMatch(/\.channel\(`krug:user:\$\{user\.id\}`\)/);
      expect(src).toMatch(/'broadcast'[^)]*event:\s*['"]krug_deleted['"]/);
      // Mora resetirati selectedKrugId kad payload odgovara otvorenom Krugu
      expect(src).toMatch(/setSelectedKrugId\(\s*\(current\)\s*=>\s*\(?\s*current\s*===\s*krugId\s*\?\s*null\s*:\s*current\s*\)?\s*\)/);
      // Cleanup
      expect(src).toMatch(/removeChannel/);
    });

    it('useKrugMembers prati `krug_membership` po krug_id', () => {
      const src = read('src/hooks/useKrug.ts');
      expect(src).toMatch(/\.channel\(`krug-members-\$\{krugId\}`\)/);
    });

    it('useKrugDeletionRequest prati `krug_deletion_request` i `krug_deletion_vote` po krug_id', () => {
      const src = read('src/hooks/useKrugDeletion.ts');
      expect(src).toMatch(/useEffect/);
      expect(src).toMatch(/\.channel\(`krug-deletion-\$\{krugId\}`\)/);
      expect(src).toMatch(/table:\s*['"]krug_deletion_request['"][^}]*filter:\s*`krug_id=eq\.\$\{krugId\}`/);
      expect(src).toMatch(/table:\s*['"]krug_deletion_vote['"][^}]*filter:\s*`krug_id=eq\.\$\{krugId\}`/);
      expect(src).toMatch(/removeChannel/);
    });
  });

  describe('Role change invalidation dopuna', () => {
    it('useKrugChangeMemberRole invalidira members + detail + pending-expenses', () => {
      const src = read('src/hooks/useKrugMemberMutations.ts');
      // Sva 3 query key-a moraju biti invalidirana u onSuccess
      const onSuccessBlock = src.match(/useKrugChangeMemberRole[\s\S]*?onSuccess:[\s\S]*?\n\s{2,4}\}\),?/);
      expect(onSuccessBlock, 'onSuccess block not found').toBeTruthy();
      const body = onSuccessBlock![0];
      expect(body).toMatch(/queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]members['"]\s*,\s*vars\.krugId\s*\]/);
      expect(body).toMatch(/queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]detail['"]\s*,\s*vars\.krugId\s*\]/);
      expect(body).toMatch(/queryKey:\s*\[\s*['"]krug['"]\s*,\s*['"]pending-expenses['"]\s*,\s*vars\.krugId\s*\]/);
    });
  });

  describe('Read-side više ne ovisi samo o focus/reconnect', () => {
    it('useKrug ima i KRUG_SYNC_QUERY_OPTIONS i realtime kanal (belt + suspenders)', () => {
      const src = read('src/hooks/useKrug.ts');
      expect(src).toMatch(/KRUG_SYNC_QUERY_OPTIONS/);
      expect(src).toMatch(/\.subscribe\(\)/);
    });

    it('useKrugDeletionRequest ima i KRUG_SYNC_QUERY_OPTIONS i realtime kanal', () => {
      const src = read('src/hooks/useKrugDeletion.ts');
      expect(src).toMatch(/KRUG_SYNC_QUERY_OPTIONS/);
      expect(src).toMatch(/\.subscribe\(\)/);
    });
  });

  describe('Migracija — Krug tablice u realtime publikaciji', () => {
    it('postoji migracija koja dodaje sve 4 tablice u supabase_realtime', () => {
      // Pronađi migraciju koja spominje `ADD TABLE public.krug_deletion_request`
      const { readdirSync } = require('fs');
      const migrations = readdirSync(resolve(__dirname, '..', '..', 'supabase/migrations'));
      const relevant = migrations
        .filter((f: string) => f.endsWith('.sql'))
        .map((f: string) => read(`supabase/migrations/${f}`))
        .filter((src: string) => src.includes('krug_deletion_request') && src.includes('supabase_realtime'));
      expect(relevant.length, 'no migration wires krug tables to realtime').toBeGreaterThan(0);
      const src = relevant.join('\n');
      expect(src).toMatch(/ADD TABLE public\.krug\b/);
      expect(src).toMatch(/ADD TABLE public\.krug_membership/);
      expect(src).toMatch(/ADD TABLE public\.krug_deletion_request/);
      expect(src).toMatch(/ADD TABLE public\.krug_deletion_vote/);
      // REPLICA IDENTITY FULL da DELETE payload nosi cijeli stari red
      expect(src).toMatch(/REPLICA IDENTITY FULL/);
    });
  });
});
