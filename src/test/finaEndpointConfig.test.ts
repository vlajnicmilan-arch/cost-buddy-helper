import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FINA_ENDPOINT,
  resolveAgainstEndpoint,
  resolveFinaEndpoint,
} from '../../supabase/functions/_shared/fina/endpoint';

const DEMO = 'https://prez.fina.hr/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService';

describe('FINA endpoint configuration', () => {
  it('falls back to the production endpoint when FINA_ENDPOINT is absent', () => {
    for (const raw of [undefined, null, '', '   ']) {
      expect(resolveFinaEndpoint(raw)).toEqual({
        endpoint: DEFAULT_FINA_ENDPOINT,
        source: 'default',
      });
    }
  });

  it('uses a trimmed https FINA_ENDPOINT', () => {
    expect(resolveFinaEndpoint(`  ${DEMO}  `)).toEqual({ endpoint: DEMO, source: 'env' });
  });

  it('refuses a non-https FINA_ENDPOINT with a clear message', () => {
    const result = resolveFinaEndpoint('http://prez.fina.hr/x');
    expect(result.endpoint).toBe(DEFAULT_FINA_ENDPOINT);
    expect(result.source).toBe('default');
    expect(result.error).toMatch(/https:\/\//);
  });

  it('keeps WSDL-derived URLs on the configured host', () => {
    const same = resolveAgainstEndpoint('./EchoBuyerMsg.xsd', DEMO);
    expect(same.hostOverridden).toBe(false);
    expect(same.url.startsWith('https://prez.fina.hr/')).toBe(true);

    const other = resolveAgainstEndpoint(
      'https://webservisi.fina.hr/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService',
      DEMO,
    );
    expect(other.hostOverridden).toBe(true);
    expect(new URL(other.url).host).toBe('prez.fina.hr');
    expect(new URL(other.url).pathname).toBe(
      '/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService',
    );
  });
});
