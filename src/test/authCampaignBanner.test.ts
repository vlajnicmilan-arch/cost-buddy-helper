import { describe, it, expect } from 'vitest';
import { readCampaignFromParams, mergeCampaign } from '@/lib/paywallCampaign';

// Mirrors CampaignBanner logic: URL wins, sessionStorage fallback, founding vs generic copy path.
describe('Auth CampaignBanner selection', () => {
  const pickCopyKey = (code: string | null) => {
    if (!code) return null;
    return code.toUpperCase() === 'FOUNDING100'
      ? 'auth.campaignBanner.founding'
      : 'auth.campaignBanner.generic';
  };

  it('shows nothing when no code in URL or storage', () => {
    const c = mergeCampaign(
      readCampaignFromParams(new URLSearchParams('?shop=1')),
      { code: null, cycle: null },
    );
    expect(pickCopyKey(c.code)).toBeNull();
  });

  it('shows founding copy for FOUNDING100 from URL', () => {
    const c = mergeCampaign(
      readCampaignFromParams(new URLSearchParams('?code=FOUNDING100')),
      { code: null, cycle: null },
    );
    expect(pickCopyKey(c.code)).toBe('auth.campaignBanner.founding');
  });

  it('shows generic copy for unknown code from URL', () => {
    const c = mergeCampaign(
      readCampaignFromParams(new URLSearchParams('?code=BLACKFRI50')),
      { code: null, cycle: null },
    );
    expect(pickCopyKey(c.code)).toBe('auth.campaignBanner.generic');
  });

  it('falls back to sessionStorage-stored code after auth redirect stripped URL', () => {
    const c = mergeCampaign(
      readCampaignFromParams(new URLSearchParams('')),
      { code: 'FOUNDING100', cycle: 'yearly' },
    );
    expect(pickCopyKey(c.code)).toBe('auth.campaignBanner.founding');
  });
});
