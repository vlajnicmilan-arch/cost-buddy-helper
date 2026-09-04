import { describe, it, expect } from 'vitest';
import { slugifyTarget, describeAnchorClick, scrollThreshold } from '@/lib/landingTelemetry';

describe('slugifyTarget', () => {
  it('normalises diacritics and spaces', () => {
    expect(slugifyTarget('Preuzmi aplikaciju')).toBe('preuzmi-aplikaciju');
    expect(slugifyTarget('Račun & štednja')).toBe('racun-stednja');
  });
  it('trims separators and caps length', () => {
    expect(slugifyTarget('  --Hello--  ')).toBe('hello');
    expect(slugifyTarget('a'.repeat(100)).length).toBe(60);
  });
  it('returns empty string for symbol-only input', () => {
    expect(slugifyTarget('!!!')).toBe('');
  });
});

describe('describeAnchorClick', () => {
  it('classifies btn anchors as CTA', () => {
    const d = describeAnchorClick({
      href: '/auth?mode=signup',
      className: 'btn btn-primary',
      text: 'Otvori račun',
    });
    expect(d).toEqual({ eventType: 'cta_click', target: 'otvori-racun', href: '/auth?mode=signup' });
  });
  it('classifies plain anchors as link', () => {
    const d = describeAnchorClick({ href: '/privacy-policy', className: '', text: 'Privatnost' });
    expect(d?.eventType).toBe('link_click');
    expect(d?.target).toBe('privatnost');
  });
  it('falls back to href slug when text is empty', () => {
    const d = describeAnchorClick({ href: '/terms', className: '', text: '' });
    expect(d?.target).toBe('terms');
  });
  it('returns null when there is no anchor', () => {
    expect(describeAnchorClick(null)).toBeNull();
  });
  it('does not treat "button" class as btn', () => {
    const d = describeAnchorClick({ href: '/x', className: 'buttonish', text: 'X' });
    expect(d?.eventType).toBe('link_click');
  });
  it('classifies explicit data-telemetry-cta="true" as CTA even without btn class', () => {
    const d = describeAnchorClick({
      href: '/auth?mode=signup',
      className: 'cta',
      text: 'Isprobaj projekte',
      telemetryTarget: 'hero_cta',
      telemetryCta: 'true',
    });
    expect(d).toEqual({ eventType: 'cta_click', target: 'hero_cta', href: '/auth?mode=signup' });
  });
  it('keeps final_signin as link_click because it has no btn and no telemetry-cta', () => {
    const d = describeAnchorClick({
      href: '/auth',
      className: 'signin',
      text: 'Već imaš račun? Prijavi se',
      telemetryTarget: 'final_signin',
    });
    expect(d?.eventType).toBe('link_click');
    expect(d?.target).toBe('final_signin');
  });
  it('falls back to link_click when neither btn nor telemetry-cta is present', () => {
    const d = describeAnchorClick({
      href: '/privacy-policy',
      className: '',
      text: 'Politika privatnosti',
    });
    expect(d?.eventType).toBe('link_click');
    expect(d?.target).toBe('politika-privatnosti');
  });
});

describe('scrollThreshold', () => {
  it('maps percentages to thresholds', () => {
    expect(scrollThreshold(0)).toBeNull();
    expect(scrollThreshold(24)).toBeNull();
    expect(scrollThreshold(25)).toBe(25);
    expect(scrollThreshold(60)).toBe(50);
    expect(scrollThreshold(99)).toBe(75);
    expect(scrollThreshold(100)).toBe(100);
  });
});
