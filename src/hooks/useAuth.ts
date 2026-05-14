// Thin re-export — auth state lives in AuthProvider so all 90+ consumers
// share one subscription and one user/session value. Multiple useAuth()
// instances previously caused race-conditions where some components saw
// `user = null` mid-flight (kicked users out on save) and others fired
// fetches before the session was restored (AbortError → retry loops).
export { useAuthContext as useAuth } from '@/contexts/AuthContext';
