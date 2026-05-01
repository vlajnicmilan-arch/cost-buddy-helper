const NATIVE_FLOW_ACTIVE_KEY = '__vmbNativeFlowActive';

export const setNativeFlowActive = (active: boolean) => {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, boolean>)[NATIVE_FLOW_ACTIVE_KEY] = active;
};

export const isNativeFlowActive = () => {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as Record<string, boolean>)[NATIVE_FLOW_ACTIVE_KEY]);
};