/**
 * Brana: certifikati u FINA_CA_PEM su prihvaćeni samo ako im se SHA-256 otisak
 * slaže s otiskom koji FINA objavljuje. Nijedan certifikat se ne prihvaća
 * "na riječ" — ako se otisak razlikuje, test pada.
 */
import { describe, it, expect } from 'vitest';
import { FINA_CA_PEM } from '../../supabase/functions/_shared/fina/finaCa.ts';
import {
  parseCertificate,
  sha256Fingerprint,
  splitPemCertificates,
} from '../../supabase/functions/_shared/fina/certInfo.ts';

// Objavljeni otisci: https://www.fina.hr/finadigicert/fina-ca-root-certifikati
const EXPECTED: Record<string, string> = {
  'Fina RDC 2025':
    'ec:d2:60:5c:fe:4a:0b:27:ab:eb:67:05:13:85:0c:b0:48:e4:86:81:5c:ce:4b:df:bf:69:8a:d8:24:03:c2:fe',
  'Fina RDC 2020':
    '54:b1:a9:33:e8:ea:3c:6e:e7:e4:bd:66:2f:d7:2c:a6:7e:82:7f:4e:76:b2:4c:df:33:a1:df:5f:9d:ab:39:7f',
  'Fina Root CA':
    '5a:b4:fc:db:18:0b:5b:6a:f0:d2:62:a2:37:5a:2c:77:d2:56:02:01:5d:96:64:87:56:61:1e:2e:78:c5:3a:d3',
};

describe('FINA CA bundle', () => {
  it('contains exactly the three expected certificates', () => {
    const cns = splitPemCertificates(FINA_CA_PEM).map((p) => parseCertificate(p).subjectCn);
    expect(cns).toEqual(['Fina RDC 2025', 'Fina RDC 2020', 'Fina Root CA']);
  });

  it('every certificate matches the fingerprint FINA publishes', async () => {
    for (const pem of splitPemCertificates(FINA_CA_PEM)) {
      const info = parseCertificate(pem);
      const fingerprint = (await sha256Fingerprint(info.der)).toLowerCase();
      expect(EXPECTED[info.subjectCn ?? '']).toBeDefined();
      expect(fingerprint).toBe(EXPECTED[info.subjectCn ?? '']);
    }
  });

  it('Fina RDC 2025 is issued by Fina Root CA', () => {
    const rdc2025 = splitPemCertificates(FINA_CA_PEM)
      .map(parseCertificate)
      .find((c) => c.subjectCn === 'Fina RDC 2025')!;
    expect(rdc2025.issuerCn).toBe('Fina Root CA');
    expect(rdc2025.selfSigned).toBe(false);
  });
});
