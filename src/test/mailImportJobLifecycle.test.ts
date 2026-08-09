/**
 * MAIL UVOZ — čuvari za dva kvara iz žive upotrebe (kolovoz 2026).
 *
 * KVAR 1: posao je ostajao 'u_obradi' (finish_job je pisao status izvan
 *         CHECK-a), cron ga je vraćao svakih ~10 min i svaki je ciklus radio
 *         NOVU stavku za istu poruku → 57 lažnih stavki.
 * KVAR 2: prazan OIB ('' nije NULL) prolazio je provjeru, potvrda nije bila
 *         idempotentna, a razlog greške se gubio u UI-ju.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  upsertIngestItem,
  USER_DECIDED_STATUSES,
} from '../../supabase/functions/_shared/mailImport/ingestItemUpsert.ts';

// ---------------------------------------------------------------- fake client

interface Row {
  id: string;
  message_id: string | null;
  attachment_id: string | null;
  status: string | null;
  created_at: string;
  [k: string]: unknown;
}

const makeClient = (rows: Row[]) => {
  let seq = rows.length;
  const client = {
    from(table: string) {
      if (table !== 'document_ingest_items') throw new Error(`unexpected table ${table}`);
      const filters: Array<(r: Row) => boolean> = [];
      let mode: 'select' | 'insert' | 'update' = 'select';
      let payload: Record<string, unknown> = {};

      const api: Record<string, unknown> = {
        select: () => {
          if (mode === 'insert') return api;
          mode = 'select';
          return api;
        },
        insert: (values: Record<string, unknown>) => {
          mode = 'insert';
          payload = values;
          return api;
        },
        update: (values: Record<string, unknown>) => {
          mode = 'update';
          payload = values;
          return api;
        },
        eq: (col: string, value: unknown) => {
          if (mode === 'update') filters.push((r) => r[col] === value);
          else filters.push((r) => r[col] === value);
          return api;
        },
        is: (col: string, value: unknown) => {
          filters.push((r) => (r[col] ?? null) === value);
          return api;
        },
        order: () => api,
        limit: () => {
          const found = rows.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: found, error: null });
        },
        single: () => {
          seq += 1;
          const row: Row = {
            id: `item-${seq}`,
            message_id: null,
            attachment_id: null,
            status: null,
            created_at: new Date().toISOString(),
            ...(payload as Record<string, unknown>),
          } as Row;
          rows.push(row);
          return Promise.resolve({ data: { id: row.id }, error: null });
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (mode === 'update') {
            for (const r of rows.filter((row) => filters.every((f) => f(row)))) {
              Object.assign(r, payload);
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return api;
    },
  };
  return { client: client as never, rows };
};

const baseRow = (status = 'na_pregledu') => ({
  source: 'mail',
  scope_type: 'user',
  scope_id: 'u1',
  owner_user_id: 'u1',
  classification: 'racun',
  status,
});

// ---------------------------------------------------------------- KVAR 1

describe('KVAR 1 — worker ne duplira stavke pri ponovnoj obradi', () => {
  it('dvostruko pokretanje nad istom porukom daje TOČNO jednu stavku po privitku', async () => {
    const { client, rows } = makeClient([]);

    for (let run = 0; run < 2; run += 1) {
      for (const attachmentId of ['att-1', 'att-2']) {
        await upsertIngestItem(client, { messageId: 'msg-1', attachmentId, row: baseRow() });
      }
    }

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.attachment_id).sort()).toEqual(['att-1', 'att-2']);
  });

  it('poruka bez privitaka (attachment_id NULL) također daje samo jednu stavku', async () => {
    const { client, rows } = makeClient([]);
    await upsertIngestItem(client, { messageId: 'msg-2', attachmentId: null, row: baseRow() });
    const second = await upsertIngestItem(client, {
      messageId: 'msg-2',
      attachmentId: null,
      row: baseRow(),
    });

    expect(rows).toHaveLength(1);
    expect(second.action).toBe('updated');
  });

  it('ponovna obrada NE gazi korisnikovu odluku', async () => {
    for (const decided of USER_DECIDED_STATUSES) {
      const { client, rows } = makeClient([
        {
          id: 'existing',
          message_id: 'msg-3',
          attachment_id: 'att-9',
          status: decided,
          created_at: '2026-08-01T00:00:00Z',
        },
      ]);
      const res = await upsertIngestItem(client, {
        messageId: 'msg-3',
        attachmentId: 'att-9',
        row: baseRow('na_pregledu'),
      });
      expect(res.action).toBe('skipped');
      expect(rows[0].status).toBe(decided);
      expect(rows).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------- izvorni kod

const WORKER = readFileSync('supabase/functions/mail-process/index.ts', 'utf8');

const migrationsWith = (needle: string): string[] => {
  const dir = 'supabase/migrations';
  return readdirSync(dir)
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .filter((sql) => sql.includes(needle));
};

const claimSql = migrationsWith('FUNCTION public.mail_ingest_claim_jobs').slice(-1)[0] ?? '';
const confirmSql = migrationsWith('FUNCTION public.mail_item_confirm').slice(-1)[0] ?? '';

describe('KVAR 1 — posao uvijek završi u terminalnom stanju', () => {
  it('worker zatvara posao i u finally grani (nikad ne ostaje u_obradi)', () => {
    expect(WORKER).toMatch(/finally\s*{/);
    expect(WORKER).toContain('worker_prekinut');
    expect(WORKER).toMatch(/mail_ingest_finish_job/);
  });

  it('worker prije preuzimanja pokreće stuck-job reaper', () => {
    expect(WORKER).toContain('mail_ingest_reap_stuck_jobs');
    expect(WORKER).toMatch(/p_older_minutes:\s*15/);
  });

  it('claim preuzima ISKLJUČIVO poslove u stanju ceka', () => {
    expect(claimSql).toContain("c.status = 'ceka'");
    expect(claimSql).not.toContain("c.status = 'u_obradi' AND c.locked_at");
  });

  it('finish_job koristi samo statuse dopuštene CHECK-om', () => {
    expect(claimSql).toContain("status = 'zavrsen'");
    expect(claimSql).toContain("status = 'neuspjeo'");
    expect(claimSql).not.toContain("SET status = 'gotov'");
    expect(claimSql).not.toContain("SET status = 'neuspjela_konacno'\n     WHERE id = p_job_id");
  });

  it('reaper postoji i vraća zombija u ceka ili neuspjeo', () => {
    expect(claimSql).toContain('FUNCTION public.mail_ingest_reap_stuck_jobs');
    expect(claimSql).toContain('zombie_job_reaped');
    expect(claimSql).toMatch(/make_interval\(mins =>/);
  });
});

// ---------------------------------------------------------------- KVAR 2

describe('KVAR 2 — potvrda: prazan OIB pada, ponovljena potvrda ne duplira', () => {
  it('prazan string se normalizira u NULL prije provjere obaveznih polja', () => {
    expect(confirmSql).toContain("NULLIF(btrim(COALESCE(p_payload->>'supplier_oib', '')), '')");
    expect(confirmSql).toContain("NULLIF(btrim(COALESCE(p_payload->>'invoice_number', '')), '')");
    expect(confirmSql).toContain("'reason', 'nedostaju_polja'");
  });

  it('prije inserta provjerava postojeći document_links (idempotencija)', () => {
    const linkCheck = confirmSql.indexOf('FROM public.document_links dl');
    const insert = confirmSql.indexOf('INSERT INTO public.incoming_invoices');
    expect(linkCheck).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(linkCheck);
    expect(confirmSql).toContain("'already', true");
  });

  it('idempotencija pokriva i druge stavke iste poruke', () => {
    expect(confirmSql).toContain('it.message_id = v_item.message_id');
  });
});
