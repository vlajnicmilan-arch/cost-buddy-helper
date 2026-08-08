import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateAliasLocal, isValidAliasLocal, aliasToAddress } from '@/lib/mailAlias';

const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/mail-ingest/index.ts'),
  'utf8'
);

describe('mail-ingest — čuvar 1: alias', () => {
  it('nepoznat/ugašen alias vraća 200 bez ijednog zapisa', () => {
    const aliasBlock = SRC.slice(SRC.indexOf('if (!aliasRow)'));
    const earlyReturn = aliasBlock.indexOf('ignored: "unknown_alias"');
    expect(earlyReturn).toBeGreaterThan(-1);
    // Prije te grane nema nijednog upisa u tablice ni u pohranu.
    const beforeAlias = SRC.slice(0, SRC.indexOf('if (!aliasRow)'));
    expect(beforeAlias).not.toMatch(/\.insert\(/);
    expect(beforeAlias).not.toMatch(/storage\s*\n?\s*\.from\("inbound-mail"\)\s*\n?\s*\.upload/);
    expect(beforeAlias).not.toMatch(/mail_ingest_store_message/);
  });

  it('alias lookup traži samo aktivne aliase', () => {
    expect(SRC).toMatch(/from\("mail_aliases"\)[\s\S]{0,200}is\("disabled_at", null\)/);
  });
});

describe('mail-ingest — replay', () => {
  it('postojeći (provider, provider_event_id) je no-op 200', () => {
    expect(SRC).toMatch(/eq\("provider", "mailgun"\)/);
    expect(SRC).toMatch(/eq\("provider_event_id", token\)/);
    expect(SRC).toMatch(/if \(existing\) return json\(\{ ok: true, replay: true \}\)/);
  });
  it('replay provjera dolazi prije upisa u pohranu', () => {
    expect(SRC.indexOf('replay: true')).toBeLessThan(SRC.indexOf('.upload('));
  });
});

describe('mail-ingest — store-then-process / transakcijski outbox', () => {
  it('jedini put upisa poruke je RPC koji upisuje i posao', () => {
    expect(SRC).toMatch(/rpc\("mail_ingest_store_message"/);
    expect(SRC).not.toMatch(/from\("inbound_messages"\)[\s\S]{0,80}\.insert\(/);
    expect(SRC).not.toMatch(/from\("ingest_jobs"\)/);
  });
  it('pad RPC-a znači 500 (poruka NIJE spremljena)', () => {
    expect(SRC).toMatch(/if \(rpcErr\)[\s\S]{0,200}store_failed[\s\S]{0,20}500/);
  });
  it('spremanje sirovog tijela prethodi RPC-u', () => {
    expect(SRC.indexOf('raw.json')).toBeLessThan(SRC.indexOf('mail_ingest_store_message'));
  });
});

describe('mail-ingest — brana na ulazu', () => {
  it('samo POST', () => {
    expect(SRC).toMatch(/req\.method !== "POST"[\s\S]{0,80}405/);
  });
  it('tajni segment putanje i HMAC ključ; bez ključa sve je 401', () => {
    expect(SRC).toMatch(/MAIL_INGEST_PATH_SECRET/);
    expect(SRC).toMatch(/MAILGUN_WEBHOOK_SIGNING_KEY/);
    expect(SRC).toMatch(/if \(!signingKey\)[\s\S]{0,220}401/);
  });
  it('timestamp tolerancija ±5 min i limit 15 MB', () => {
    expect(SRC).toMatch(/TIMESTAMP_TOLERANCE_S = 300/);
    expect(SRC).toMatch(/MAX_TOTAL_BYTES = 15 \* 1024 \* 1024/);
  });
  it('nepoznat content-type → 400', () => {
    expect(SRC).toMatch(/unsupported_content_type" \}, 400/);
  });
});

describe('mail alias format', () => {
  it('c- + 16 znakova iz [a-z2-9]', () => {
    for (let i = 0; i < 200; i++) {
      const a = generateAliasLocal();
      expect(a).toMatch(/^c-[a-z2-9]{16}$/);
      expect(isValidAliasLocal(a)).toBe(true);
    }
  });
  it('odbija neispravan format', () => {
    expect(isValidAliasLocal('c-abc')).toBe(false);
    expect(isValidAliasLocal('c-aaaaaaaaaaaaaaa1')).toBe(false); // '1' nije u abecedi
    expect(isValidAliasLocal('x-abcdefghijklmnop')).toBe(false);
  });
  it('adresa koristi centar.vmbalance.com', () => {
    expect(aliasToAddress('c-abcdefgh23456789')).toBe('c-abcdefgh23456789@centar.vmbalance.com');
  });
});
