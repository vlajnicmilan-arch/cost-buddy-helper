import { useBundleFreshness } from '@/hooks/useBundleFreshness';

/** Headless host — silent web bundle self-refresh. Renders nothing, ever. */
export const BundleFreshnessHost = () => {
  useBundleFreshness();
  return null;
};

export default BundleFreshnessHost;
