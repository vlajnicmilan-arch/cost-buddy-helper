/**
 * Was this document served with the landing markup already baked into the
 * HTML (build-time prerender), or is it the plain SPA shell?
 *
 * The build step writes `<meta name="landing-render" content="baked"
 * data-path="/...">` into the generated documents. The marker carries the path
 * it was baked for, so a client-side navigation away from the baked route is
 * correctly reported as `spa`.
 *
 * Pure resolver below is unit-tested; `detectRenderMode` only reads the DOM.
 */

export type LandingRenderMode = 'baked' | 'spa';

export interface RenderMarker {
  content: string | null;
  path: string | null;
}

/** Decide the render mode from the baked marker and the current path. */
export const resolveRenderMode = (
  marker: RenderMarker | null,
  pathname: string,
): LandingRenderMode => {
  if (!marker || marker.content !== 'baked') return 'spa';
  const normalize = (p: string) => {
    if (!p) return '/';
    const clean = p.split('?')[0].split('#')[0].toLowerCase();
    return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
  };
  if (!marker.path) return 'spa';
  const bakedPath = normalize(marker.path);
  const current = normalize(pathname);
  if (bakedPath === current) return 'baked';
  // The document baked for "/" is the same file served at "/landing" — the
  // markup there is baked too.
  if (bakedPath === '/' && current === '/landing') return 'baked';
  return 'spa';
};

/** Read the marker from the live document. Never throws. */
export const detectRenderMode = (): LandingRenderMode => {
  try {
    const el = document.querySelector('meta[name="landing-render"]');
    const marker: RenderMarker | null = el
      ? { content: el.getAttribute('content'), path: el.getAttribute('data-path') }
      : null;
    return resolveRenderMode(marker, window.location.pathname);
  } catch {
    return 'spa';
  }
};
