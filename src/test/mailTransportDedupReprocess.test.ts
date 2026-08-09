/**
 * ČUVAR — REPROCESS NIJE PRVI DOLAZAK (nalog #6b).
 *
 * Kvar: ponovna obrada je pogodila zrcalnu kopiju iz drugog maila (isti
 * sha256), i to kopiju koja je i sama bila odbačena, pa je original prepisan
 * u `odbaceno` prije ekstrakcije.
 */
import { describe, it, expect } from 'vitest';
import { resolveTransportDedup } from '../../supabase/functions/_shared/mailImport/transportDedup.ts';

interface Row {
  id: string;
  message_id?: string | null;
  attachment_id?: string | null;
  owner_user_id?: string | null;
  dedup_identity?: string | null;
  classification?: string | null;
  duplicate_of_item_id?: string | null;
}

const makeClient = (rows: Row[]) => {
  const calls: string[][] = [];
  return {
    calls,
    client: {
      from: () => {
        const filters: Array<(r: Row) => boolean> = [];
        const trace: string[] = [];
        calls.push(trace);
        const b: any = {};
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
          trace.push(`eq:${col}`);
          filters.push((r) => (r as any)[col] === val);
          return b;
        };
        b.neq = (col: string, val: unknown) => {
          trace.push(`neq:${col}`);
          filters.push((r) => (r as any)[col] !== val);
          return b;
        };
        b.is = (col: string, val: unknown) => {
          trace.push(`is:${col}`);
          filters.push((r) => ((r as any)[col] ?? null) === val);
          return b;
        };
        b.or = (expr: string) => {
          trace.push(`or:${expr}`);
          if (expr.includes('duplikat_privitka')) {
            filters.push((r) => (r.classification ?? null) !== 'duplikat_privitka');
          }
          return b;
        };
        b.limit = async () => ({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
        return b;
      },
    },
  };
};

const params = {
  ownerId: 'u1',
  messageId: 'msg-original',
  attachmentId: 'att-1',
  sha: 'HASH',
};

describe('resolveTransportDedup', () => {
  it('reprocess uz prisutnu odbačenu zrcalnu kopiju → osvježenje, ne odbacivanje', async () => {
    const { client } = makeClient([
      // sama stavka koja se ponovno obrađuje
      { id: 'orig', message_id: 'msg-original', attachment_id: 'att-1', owner_user_id: 'u1', dedup_identity: 'sha256:HASH' },
      // zrcalna kopija iz drugog maila, i sama odbačena
      {
        id: 'mirror',
        message_id: 'msg-other',
        attachment_id: 'att-9',
        owner_user_id: 'u1',
        dedup_identity: 'sha256:HASH',
        classification: 'duplikat_privitka',
        duplicate_of_item_id: 'orig',
      },
    ]);
    expect(await resolveTransportDedup(client as never, params)).toEqual({ kind: 'refresh' });
  });

  it('novi mail s istim hashom kao PRAVA stavka → i dalje duplikat_privitka', async () => {
    const { client } = makeClient([
      {
        id: 'orig',
        message_id: 'msg-original',
        attachment_id: 'att-1',
        owner_user_id: 'u1',
        dedup_identity: 'sha256:HASH',
        classification: 'racun',
        duplicate_of_item_id: null,
      },
    ]);
    const res = await resolveTransportDedup(client as never, {
      ...params,
      messageId: 'msg-new',
      attachmentId: 'att-new',
    });
    expect(res).toEqual({ kind: 'duplicate', anchorId: 'orig' });
  });

  it('odbačena kopija NIKAD nije sidro za novi dolazak', async () => {
    const { client } = makeClient([
      {
        id: 'mirror',
        message_id: 'msg-other',
        attachment_id: 'att-9',
        owner_user_id: 'u1',
        dedup_identity: 'sha256:HASH',
        classification: 'duplikat_privitka',
        duplicate_of_item_id: 'orig',
      },
    ]);
    const res = await resolveTransportDedup(client as never, {
      ...params,
      messageId: 'msg-new',
      attachmentId: 'att-new',
    });
    expect(res).toEqual({ kind: 'none' });
  });

  it('bez hasha i bez postojeće stavke → nema dedupa', async () => {
    const { client } = makeClient([]);
    expect(
      await resolveTransportDedup(client as never, { ...params, messageId: 'msg-new', sha: null })
    ).toEqual({ kind: 'none' });
  });

  it('worker koristi helper i ne radi sirovi dedup upit', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('supabase/functions/mail-process/index.ts', 'utf8')
    );
    expect(src).toContain('resolveTransportDedup');
    expect(src).not.toMatch(/\.eq\("dedup_identity"/);
  });
});
