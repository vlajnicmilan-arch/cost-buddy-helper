import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useBankConnections, type BankAccount } from '@/hooks/useBankConnections';
import { isAccountSyncExcluded } from '@/lib/bankSyncExclusions';

// Throttle constants — MORAJU ostati u sinkronu s bank-sync-transactions edge funkcijom.
// Server je autoritativan; klijentski pre-check je samo brži mirror da izbjegnemo mrežne pozive.
const SYNC_COOLDOWN_MINUTES = 120;
const RATE_LIMIT_COOLDOWN_MINUTES = 240;

/** Vrati koliko sekundi do sljedećeg dopuštenog sinca, ili 0 ako je račun slobodan. */
export function computeAccountThrottleRemainingSec(acc: BankAccount, nowMs: number): number {
  const rateLimited =
    typeof acc.last_sync_error === 'string' && acc.last_sync_error.includes('429');
  if (rateLimited && acc.updated_at) {
    const remainingMs =
      RATE_LIMIT_COOLDOWN_MINUTES * 60 * 1000 - (nowMs - new Date(acc.updated_at).getTime());
    if (remainingMs > 0) return Math.ceil(remainingMs / 1000);
  }
  if (acc.last_synced_at) {
    const remainingMs =
      SYNC_COOLDOWN_MINUTES * 60 * 1000 - (nowMs - new Date(acc.last_synced_at).getTime());
    if (remainingMs > 0) return Math.ceil(remainingMs / 1000);
  }
  return 0;
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function formatDurationHm(totalSeconds: number, t: TFn): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return t('openBanking.throttle.durationHm', { h, m });
  if (m > 0) return t('openBanking.throttle.durationM', { m });
  return t('openBanking.throttle.durationLtMinute');
}

export interface SyncAllProgress {
  current: number;
  total: number;
}

export interface UseSyncAllBankAccountsResult {
  /** True ako korisnik uopće ima bank account u trenutnom kontekstu. */
  hasAccounts: boolean;
  /** True ako je BILO KOJI account u cooldownu (gumb čeka da SVI budu spremni). */
  allCooldown: boolean;
  /** Human-readable "još Xm" do trenutka kad će i zadnji račun biti slobodan. */
  nextAvailableLabel: string;
  /** True dok traje sekvencijalna orkestracija. */
  isRunning: boolean;
  progress: SyncAllProgress | null;
  /** Pokreni sekvencijalni sync svih računa. */
  run: () => Promise<void>;
}

/**
 * Orkestrira sekvencijalni sync svih bankovnih računa u trenutnom kontekstu.
 * - Klijentski pre-check throttle → preskače cooldown račune bez mrežnog poziva.
 * - Server-side guard (bank-sync-transactions) je autoritativan — mirror je samo brži.
 * - Sekvencijalno (for/await), nikad paralelno: EB rate limit po ASPSP je oštar.
 */
export function useSyncAllBankAccounts(): UseSyncAllBankAccountsResult {
  const { t } = useTranslation();
  const { accounts: allAccounts, refetch } = useBankConnections();
  const qc = useQueryClient();

  // Isključeni računi ne smiju utjecati na hasAccounts/allCooldown ni na sam sync.
  const accounts = useMemo(
    () => allAccounts.filter((a) => !isAccountSyncExcluded(a.id)),
    [allAccounts],
  );

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<SyncAllProgress | null>(null);

  // Tick za live-osvježavanje countdown labela (30s) — isti obrazac kao OpenBankingPanel.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const hasAccounts = accounts.length > 0;

  const { allCooldown, minRemainingSec } = useMemo(() => {
    if (accounts.length === 0) {
      return { allCooldown: false, minRemainingSec: 0 };
    }
    let allCd = true;
    let minRem = Number.POSITIVE_INFINITY;
    for (const a of accounts) {
      const rem = computeAccountThrottleRemainingSec(a, nowMs);
      if (rem <= 0) {
        allCd = false;
      } else if (rem < minRem) {
        minRem = rem;
      }
    }
    return {
      allCooldown: allCd,
      minRemainingSec: Number.isFinite(minRem) ? minRem : 0,
    };
  }, [accounts, nowMs]);

  const nextAvailableLabel = allCooldown
    ? formatDurationHm(minRemainingSec, t as TFn)
    : '';

  const run = useCallback(async () => {
    if (isRunning || !hasAccounts) return;
    setIsRunning(true);
    setProgress({ current: 0, total: accounts.length });

    let synced = 0;
    let skipped = 0;
    let rateLimited = 0;
    let errors = 0;
    const total = accounts.length;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = `Bearer ${session?.access_token ?? ''}`;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bank-sync-transactions`;

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        setProgress({ current: i + 1, total });

        // Klijentski pre-check: preskoči bez poziva ako je u cooldownu.
        const remaining = computeAccountThrottleRemainingSec(acc, Date.now());
        if (remaining > 0) {
          skipped++;
          continue;
        }

        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
              apikey,
            },
            body: JSON.stringify({ bank_account_id: acc.id }),
          });
          const payload = await res.json().catch(() => ({} as any));

          if (res.status === 429 && payload?.throttled) {
            // Server je autoritativno rekao "ne sad". Broji kao skipped da ne strašimo korisnika,
            // osim kad je razlog ASPSP rate limit — tu je banka odbila, korisnik to zaslužuje znati.
            if (payload.reason === 'aspsp_cooldown') rateLimited++;
            else skipped++;
            continue;
          }

          if (!res.ok) {
            errors++;
            continue;
          }

          synced++;
        } catch {
          errors++;
        }
      }

      // Sažetak — showSuccess/showError iz StatusFeedback sustava, ne toast.
      if (errors > 0 || rateLimited > 0) {
        showError(
          t('wallet.syncAll.summaryPartialError', { count: errors + rateLimited })
        );
      } else if (synced === 0 && skipped === total) {
        showSuccess(t('wallet.syncAll.summaryAllRecent'));
      } else if (skipped > 0) {
        showSuccess(t('wallet.syncAll.summaryMixed', { synced, skipped }));
      } else {
        showSuccess(t('wallet.syncAll.summarySynced', { count: synced }));
      }

      qc.invalidateQueries({ queryKey: ['expenses'] });
      refetch();
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [accounts, hasAccounts, isRunning, qc, refetch, t]);

  return {
    hasAccounts,
    allCooldown,
    nextAvailableLabel,
    isRunning,
    progress,
    run,
  };
}
