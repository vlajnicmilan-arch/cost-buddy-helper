/**
 * Krug Resume/Reconnect Sync Patch — shared per-hook sync overrides.
 *
 * Sve Krug read hookove opremamo istim resume/reconnect obrascem, bez diranja
 * globalnog QueryClient default-a. Cilj je zatvoriti audit stavke N4/N8 —
 * detail, members, my-list, pending queue i deletion state se moraju samo
 * obnoviti nakon focus/reconnect umjesto da ostanu stale iz backgrounda.
 */
export const KRUG_SYNC_QUERY_OPTIONS = {
  refetchOnWindowFocus: true as const,
  refetchOnReconnect: true as const,
};
