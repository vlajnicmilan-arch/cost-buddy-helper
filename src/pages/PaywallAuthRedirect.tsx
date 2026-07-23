import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { readCampaignFromParams, saveCampaign } from '@/lib/paywallCampaign';

/**
 * Public /paywall entry for unauthenticated cloud users.
 * Persists `?code=` and `?cycle=` into sessionStorage so the founding
 * link survives sign-in, then hands off to /auth with `next=/paywall...`
 * so the Auth page returns the user to the exact same URL.
 */
export default function PaywallAuthRedirect() {
  const location = useLocation();
  const search = location.search || '';

  useEffect(() => {
    const params = new URLSearchParams(search);
    saveCampaign(readCampaignFromParams(params));
  }, [search]);

  const next = encodeURIComponent(`/paywall${search}`);
  return <Navigate to={`/auth?next=${next}`} replace />;
}
