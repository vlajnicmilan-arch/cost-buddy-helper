/**
 * Brana: u TLS rukovanje ide list + izdavatelj, nikad korijenski certifikat.
 */
import { describe, it, expect } from 'vitest';
import { FINA_CA_PEM } from '../../supabase/functions/_shared/fina/finaCa.ts';
import { buildClientChain } from '../../supabase/functions/_shared/fina/chain.ts';
import {
  parseCertificate,
  splitPemCertificates,
} from '../../supabase/functions/_shared/fina/certInfo.ts';

const CA_PEMS = splitPemCertificates(FINA_CA_PEM);
const byCn = (cn: string) => CA_PEMS.find((p) => parseCertificate(p).subjectCn === cn)!;

describe('client certificate chain', () => {
  it('appends the issuer found in the CA bundle and stops before the root', () => {
    // Fina RDC 2025 stoji na mjestu lista: izdavatelj mu je Fina Root CA,
    // a korijen se ne šalje.
    const chain = buildClientChain(byCn('Fina RDC 2025'), [], CA_PEMS);
    expect(chain.cns).toEqual(['Fina RDC 2025']);
    expect(chain.cns).not.toContain('Fina Root CA');
  });

  it('prefers the issuer that came inside the p12', () => {
    const chain = buildClientChain(byCn('Fina RDC 2020'), [byCn('Fina RDC 2020')], CA_PEMS);
    expect(chain.cns).toEqual(['Fina RDC 2020']);
    expect(chain.issuerSource).toBe('none');
  });

  it('never returns a root-only chain and always keeps the leaf first', () => {
    const chain = buildClientChain(byCn('Fina Root CA'), [], CA_PEMS);
    expect(chain.cns[0]).toBe('Fina Root CA');
    expect(chain.cns).toHaveLength(1);
    expect(splitPemCertificates(chain.pem)).toHaveLength(1);
  });

  it('reads subject and issuer CN for diagnostics', () => {
    const info = parseCertificate(byCn('Fina RDC 2020'));
    expect(info.subjectCn).toBe('Fina RDC 2020');
    expect(info.issuerCn).toBe('Fina Root CA');
    expect(info.aki).toBeTruthy();
  });
});
