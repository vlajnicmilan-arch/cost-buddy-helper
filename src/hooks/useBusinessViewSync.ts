/**
 * @deprecated WalletViewModeContext is now derived directly from AppStateContext.
 * No bidirectional sync is needed. This is a no-op kept for backward compatibility
 * with any lingering imports; safe to remove once all callers are gone.
 */
export const useBusinessViewSync = () => {
  // no-op
};
