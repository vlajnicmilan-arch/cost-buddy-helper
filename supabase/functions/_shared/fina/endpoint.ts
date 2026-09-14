// FINA service endpoint resolution.
//
// The production endpoint stays the default. A deployment may point the probes
// at the FINA DEMO environment by setting the FINA_ENDPOINT secret. Any URL
// derived from the WSDL (schema imports, soap:address) keeps the host of the
// configured endpoint — only the path may be taken from the WSDL — so a demo
// certificate can never end up talking to production.

export const DEFAULT_FINA_ENDPOINT =
  "https://webservisi.fina.hr/B2BFinaInvoiceWebService/services/B2BFinaInvoiceWebService";

export type EndpointSource = "env" | "default";

export interface ResolvedEndpoint {
  endpoint: string;
  source: EndpointSource;
  /** Set when FINA_ENDPOINT was present but unusable; the default is used. */
  error?: string;
}

export function resolveFinaEndpoint(raw: string | null | undefined): ResolvedEndpoint {
  const value = (raw ?? "").trim();
  if (!value) return { endpoint: DEFAULT_FINA_ENDPOINT, source: "default" };
  if (!value.startsWith("https://")) {
    return {
      endpoint: DEFAULT_FINA_ENDPOINT,
      source: "default",
      error: "FINA_ENDPOINT must start with https:// — refusing to use it",
    };
  }
  return { endpoint: value, source: "env" };
}

export interface ResolvedWsdlUrl {
  url: string;
  /** True when the WSDL pointed at another host and we forced the endpoint host. */
  hostOverridden: boolean;
}

/**
 * Resolve a location found in a WSDL against the configured endpoint.
 * Only the path/query is honoured; the origin always comes from `endpoint`.
 */
export function resolveAgainstEndpoint(
  location: string,
  endpoint: string,
  base = `${endpoint}?wsdl`,
): ResolvedWsdlUrl {
  const target = new URL(location, base);
  const origin = new URL(endpoint);
  if (target.origin === origin.origin) {
    return { url: target.toString(), hostOverridden: false };
  }
  const forced = new URL(target.pathname + target.search + target.hash, origin.origin);
  return { url: forced.toString(), hostOverridden: true };
}
