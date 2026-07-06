import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Typed shim for the beta supabase.auth.oauth namespace.
type OAuthClientInfo = {
  name?: string;
  client_uri?: string;
  logo_uri?: string;
};
type AuthorizationDetails = {
  client?: OAuthClientInfo;
  redirect_url?: string;
  redirect_to?: string;
  scopes?: string[];
};
type AuthorizationResponse = {
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationResponse | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationResponse | null; error: { message: string } | null }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthApi.getAuthorizationDetails(
        authorizationId,
      );
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  };

  if (error) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full space-y-3 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Autorizacija nije uspjela
          </h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details.client?.name ?? "vanjska aplikacija";

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Povezati {clientName} s V&amp;M Balance?
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} će moći koristiti V&amp;M Balance u tvoje ime — čitati
            transakcije, saldo novčanika i dodavati troškove.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            disabled={busy}
            onClick={() => decide(true)}
            className="w-full"
          >
            Odobri
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => decide(false)}
            className="w-full"
          >
            Odbij
          </Button>
        </div>
      </div>
    </main>
  );
};

export default OAuthConsent;
