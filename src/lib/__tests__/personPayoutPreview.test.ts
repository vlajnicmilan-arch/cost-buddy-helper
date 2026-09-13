import { describe, expect, it } from 'vitest';
import { sumEngagementPreviews } from '@/lib/personPayoutPreview';

describe('sumEngagementPreviews', () => {
  it('zbraja bruto preko svih angažmana i zaokružuje na 2 decimale', () => {
    expect(sumEngagementPreviews([{ gross: 100.005 }, { gross: 50.005 }])).toBe(150.01);
  });

  it('vraća 0 za prazan popis', () => {
    expect(sumEngagementPreviews([])).toBe(0);
  });

  it('podnosi nebrojčane vrijednosti kao 0', () => {
    expect(sumEngagementPreviews([{ gross: Number.NaN }, { gross: 25 }])).toBe(25);
  });
});
