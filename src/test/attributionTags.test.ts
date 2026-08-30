import { describe, it, expect } from 'vitest';
import {
  extractAttributionTags,
  hasAttributionMarkers,
  ATTRIBUTION_FIELD_MAX,
  LANDING_QUERY_MAX,
} from '@/lib/attributionTags';

describe('extractAttributionTags', () => {
  it('returns an empty object when there is no query', () => {
    expect(extractAttributionTags('')).toEqual({});
    expect(extractAttributionTags(null)).toEqual({});
    expect(extractAttributionTags(undefined)).toEqual({});
  });

  it('reads a full set of tags', () => {
    const tags = extractAttributionTags(
      '?utm_source=facebook&utm_medium=cpc&utm_campaign=ljeto&utm_content=v2&utm_term=knjigovodstvo&fbclid=ABC123',
    );
    expect(tags).toMatchObject({
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'ljeto',
      utm_content: 'v2',
      utm_term: 'knjigovodstvo',
      fbclid: 'ABC123',
    });
    expect(tags.gclid).toBeUndefined();
    expect(tags.landing_query).toContain('utm_source=facebook');
  });

  it('handles partial tags and works without the leading question mark', () => {
    const tags = extractAttributionTags('gclid=XYZ&foo=bar');
    expect(tags.gclid).toBe('XYZ');
    expect(tags.utm_source).toBeUndefined();
    expect(tags.landing_query).toBe('gclid=XYZ&foo=bar');
  });

  it('truncates values and the query string', () => {
    const long = 'a'.repeat(500);
    const tags = extractAttributionTags(`?utm_campaign=${long}`);
    expect(tags.utm_campaign?.length).toBe(ATTRIBUTION_FIELD_MAX);
    expect(tags.landing_query?.length).toBe(LANDING_QUERY_MAX);
  });

  it('keeps landing_query but reports no markers for unrelated params', () => {
    const tags = extractAttributionTags('?page=2');
    expect(hasAttributionMarkers(tags)).toBe(false);
    expect(tags.landing_query).toBe('page=2');
  });

  it('reports markers when any tag is present', () => {
    expect(hasAttributionMarkers(extractAttributionTags('?fbclid=1'))).toBe(true);
    expect(hasAttributionMarkers(extractAttributionTags('?utm_medium=cpc'))).toBe(true);
  });
});
