import { describe, it, expect } from 'vitest';
import { classifyResource, summarizeResources, describeLcpElement } from '@/lib/landingPerf';

describe('classifyResource', () => {
  it('classifies by extension and initiator', () => {
    expect(classifyResource('https://x/assets/index-abc.js', 'script')).toBe('js');
    expect(classifyResource('https://x/assets/index.css', 'link')).toBe('css');
    expect(classifyResource('https://fonts.gstatic.com/s/a.woff2', 'css')).toBe('font');
    expect(classifyResource('https://fonts.googleapis.com/css2?family=X', 'link')).toBe('css');
    expect(classifyResource('/centar/img/shot1.webp', 'img')).toBe('img');
    expect(classifyResource('https://x/', 'navigation')).toBe('document');
    expect(classifyResource('https://x/rest/v1/landing_events', 'fetch')).toBe('other');
  });

  it('ignores query strings', () => {
    expect(classifyResource('/a/b.js?v=2', 'other')).toBe('js');
  });
});

describe('summarizeResources', () => {
  it('aggregates bytes and counts per kind', () => {
    const r = summarizeResources([
      { name: '/a.js', initiatorType: 'script', transferSize: 1024 },
      { name: '/b.js', initiatorType: 'script', transferSize: 2048 },
      { name: '/c.css', initiatorType: 'link', transferSize: 1024 },
      { name: '/d.webp', initiatorType: 'img' },
    ]);
    expect(r.requests).toBe(4);
    expect(r.buckets.js).toEqual({ n: 2, kb: 3 });
    expect(r.buckets.css).toEqual({ n: 1, kb: 1 });
    expect(r.buckets.img).toEqual({ n: 1, kb: 0 });
    expect(r.totalKb).toBe(4);
  });
});

describe('describeLcpElement', () => {
  it('builds a short label from the element', () => {
    expect(describeLcpElement({ tagName: 'P', className: 'lede rise in', id: '' })).toBe('p.lede.rise');
    expect(describeLcpElement({ tagName: 'IMG', className: '', id: 'hero' })).toBe('img#hero');
  });
  it('falls back to the resource url, then unknown', () => {
    expect(describeLcpElement(null, 'https://x/img/shot1.webp')).toBe('shot1.webp');
    expect(describeLcpElement(null)).toBe('unknown');
  });
});
