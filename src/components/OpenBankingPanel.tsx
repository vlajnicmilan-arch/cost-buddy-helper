import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Building2, Plus, Loader2, ExternalLink, Trash2, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { supabaseInvoke } from '@/lib/supabaseInvoke';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useBankConnections } from '@/hooks/useBankConnections';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

interface Aspsp {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
}

const COUNTRIES_SANDBOX = [
  { code: 'FI', label: 'Finland (sandbox)' },
  { code: 'EE', label: 'Estonia (sandbox)' },
  { code: 'LV', label: 'Latvia (sandbox)' },
  { code: 'LT', label: 'Lithuania (sandbox)' },
];

export const OpenBankingPanel = () => {
  const { t } = useTranslation();
  const { connections, accounts, isLoading, refetch, disconnect, activeBusinessProfileId } = useBankConnections();
  const { profiles } = useBusinessProfiles();
  const activeProfileName = activeBusinessProfileId
    ? profiles.find(p => p.id === activeBusinessProfileId)?.name ?? null
    : null;
  const contextLabel = activeProfileName ?? t('openBanking.contextPersonal', 'Osobno');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [country, setCountry] = useState('FI');
  const [aspsps, setAspsps] = useState<Aspsp[]>([]);
  const [loadingAspsps, setLoadingAspsps] = useState(false);
  const [selectedAspsp, setSelectedAspsp] = useState<string>('');
  const [connecting, setConnecting] = useState(false);

  // Refresh on focus / postMessage from callback
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'enable_banking_callback') {
        if (e.data.ok) showSuccess(t('openBanking.connected'));
        refetch();
      }
    };
    window.addEventListener('message', onMsg);
    // Also check URL param after redirect (web flow)
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('bank_connected') === '1') {
        showSuccess(t('openBanking.connected'));
        url.searchParams.delete('bank_connected');
        window.history.replaceState({}, '', url.toString());
        refetch();
      }
    } catch { /* noop */ }
    return () => window.removeEventListener('message', onMsg);
  }, [refetch, t]);

  // Load aspsps when dialog opens or country changes
  useEffect(() => {
    if (!dialogOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingAspsps(true);
      setSelectedAspsp('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bank-list-aspsps?country=${country}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } }
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || 'load_failed');
        setAspsps(json.aspsps ?? []);
      } catch (e: any) {
        if (!cancelled) {
          showError(e.message ?? String(e));
          setAspsps([]);
        }
      } finally {
        if (!cancelled) setLoadingAspsps(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dialogOpen, country]);

  const accountsByConn = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach(a => map.set(a.connection_id, (map.get(a.connection_id) ?? 0) + 1));
    return map;
  }, [accounts]);

  const handleConnect = async () => {
    if (!selectedAspsp) return;
    setConnecting(true);
    try {
      const { data, error } = await supabaseInvoke<{ authorization_url: string }>('bank-connect-start', {
        body: {
          aspsp_name: selectedAspsp,
          aspsp_country: country,
          language: 'en',
          psu_type: activeBusinessProfileId ? 'business' : 'personal',
          business_profile_id: activeBusinessProfileId,
        },
      });
      if (error || !data?.authorization_url) {
        throw new Error((error as any)?.message || 'connect_failed');
      }
      setDialogOpen(false);
      // Open auth URL — native uses in-app browser, web opens new tab
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: data.authorization_url });
      } else {
        window.open(data.authorization_url, '_blank', 'noopener,noreferrer');
      }
    } catch (e: any) {
      showError(e.message ?? t('openBanking.connectError'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!window.confirm(t('openBanking.disconnectConfirm'))) return;
    try {
      await disconnect(id);
    } catch (e: any) {
      showError(e.message ?? String(e));
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-primary/10 text-primary border-primary/20',
      pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
      expired: 'bg-muted text-muted-foreground',
      revoked: 'bg-muted text-muted-foreground',
      failed: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return (
      <Badge variant="outline" className={variants[status] ?? ''}>
        {t(`openBanking.status.${status}`, status)}
      </Badge>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">{t('openBanking.title')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{t('openBanking.subtitle')}</p>
            <div className="mt-1.5">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {contextLabel}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="shrink-0 min-h-11"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('openBanking.connectButton')}
        </Button>
      </div>

      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <span>{t('openBanking.sandboxNotice')}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('openBanking.noConnections')}
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map(conn => {
            const accCount = accountsByConn.get(conn.id) ?? 0;
            return (
              <li
                key={conn.id}
                className="rounded-lg border bg-background p-3 flex items-center gap-3"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {conn.aspsp_name ?? conn.bank_name}
                    </span>
                    {statusBadge(conn.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {accCount} {t('openBanking.accounts')}
                    {conn.valid_until && (
                      <> · {t('openBanking.validUntil')}: {new Date(conn.valid_until).toLocaleDateString()}</>
                    )}
                  </div>
                  {conn.last_error && (
                    <div className="text-xs text-destructive mt-1 flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{conn.last_error}</span>
                    </div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDisconnect(conn.id)}
                  aria-label={t('openBanking.disconnect')}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            );
          })}

          {/* Accounts list */}
          {accounts.length > 0 && (
            <li className="pt-2 mt-2 border-t">
              <ul className="space-y-1.5">
                {accounts.map(acc => (
                  <li
                    key={acc.id}
                    className="text-xs flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-muted/40"
                  >
                    <span className="truncate">
                      {acc.name ?? acc.iban ?? acc.account_uid}
                      {acc.iban && acc.name && (
                        <span className="text-muted-foreground ml-1">· {acc.iban}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono">
                      {acc.balance != null
                        ? `${acc.balance.toFixed(2)} ${acc.currency}`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('openBanking.connectButton')}</DialogTitle>
            <DialogDescription>{t('openBanking.openingBank')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('openBanking.selectCountry')}</label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES_SANDBOX.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('openBanking.selectBank')}</label>
              {loadingAspsps ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('openBanking.loadingBanks')}
                </div>
              ) : aspsps.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">{t('openBanking.noBanks')}</p>
              ) : (
                <Select value={selectedAspsp} onValueChange={setSelectedAspsp}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {aspsps.map(a => (
                      <SelectItem key={`${a.name}-${a.country}`} value={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={connecting}
              className="min-h-11"
            >
              {t('openBanking.cancel')}
            </Button>
            <Button
              onClick={handleConnect}
              disabled={!selectedAspsp || connecting}
              className="min-h-11"
            >
              {connecting ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />{t('openBanking.connecting')}</>
              ) : (
                <><ExternalLink className="w-4 h-4 mr-1" />{t('openBanking.continue')}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
