import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FALLBACK_ORIGINS, getCandidateOrigins } from '@/components/update/updateUtils';

const configSource = readFileSync(join(__dirname, '..', '..', 'capacitor.config.ts'), 'utf8');

describe('android shell 3.0.2 — app.vmbalance.com', () => {
  it('allowNavigation includes app.vmbalance.com alongside existing hosts', () => {
    expect(configSource).toContain("'app.vmbalance.com'");
    expect(configSource).toContain("'vmbalance.com'");
    expect(configSource).toContain("'www.vmbalance.com'");
    expect(configSource).toContain("'cost-buddy-helper.lovable.app'");
  });

  it('server.url stays on https://vmbalance.com/app?forceHideBadge=true', () => {
    expect(configSource).toContain("url: 'https://vmbalance.com/app?forceHideBadge=true'");
  });

  it('update candidates include https://app.vmbalance.com after existing fallbacks', () => {
    expect(FALLBACK_ORIGINS).toContain('https://app.vmbalance.com');
    expect(FALLBACK_ORIGINS.indexOf('https://app.vmbalance.com')).toBeGreaterThan(
      FALLBACK_ORIGINS.indexOf('https://cost-buddy-helper.lovable.app'),
    );
    expect(getCandidateOrigins()).toContain('https://app.vmbalance.com');
  });
});
