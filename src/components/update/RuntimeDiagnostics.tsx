import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '@/lib/version';
import { isNativeApp, getPlatformName, fetchLatestVersion, type VersionCheckResult } from './updateUtils';
import { getLastStorageResult } from '@/lib/secureStorage';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';

export const RuntimeDiagnostics = () => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [remoteCheck, setRemoteCheck] = useState<VersionCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [swStatus, setSwStatus] = useState<string>('unknown');
  const [nativeVersion, setNativeVersion] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwStatus(reg ? 'active' : 'none');
      }).catch(() => setSwStatus('error'));
    } else {
      setSwStatus('unsupported');
    }

    // Read actual installed APK/IPA versionName via Capacitor App plugin
    if (isNativeApp) {
      import('@capacitor/app')
        .then(({ App }) => App.getInfo())
        .then((info) => setNativeVersion(info.version))
        .catch(() => setNativeVersion('N/A'));
    }
  }, []);


  const handleCheckRemote = async () => {
    setChecking(true);
    try {
      const result = await fetchLatestVersion();
      setRemoteCheck(result);
    } finally {
      setChecking(false);
    }
  };

  const platform = getPlatformName();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'N/A';
  const href = typeof window !== 'undefined' ? window.location.href : 'N/A';
  const lastStorage = getLastStorageResult();

  return (
    <div className="mt-3 border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Activity className="w-3 h-3" />
          Runtime dijagnostika
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-xs font-mono">
          <Row label="Runtime" value={isNativeApp ? '🟢 Native' : '🌐 Web/PWA'} />
          <Row label="Platforma" value={platform} />
          {isNativeApp && (
            <Row
              label="Native APK verzija"
              value={nativeVersion ?? '...'}
            />
          )}
          <Row label="Web bundle verzija" value={APP_VERSION} />
          <Row label="Origin" value={origin} />
          <Row label="Href" value={href} truncate />
          <Row label="Service Worker" value={swStatus} />
          <Row label="Storage backend" value={lastStorage.backend} />
          <Row label="Storage OK" value={lastStorage.success ? '✅' : '❌'} />
          {lastStorage.error && <Row label="Storage error" value={lastStorage.error} truncate />}

          <button
            onClick={handleCheckRemote}
            disabled={checking}
            className="mt-2 w-full text-center py-1.5 px-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            {checking ? 'Provjeravam...' : 'Provjeri remote verziju'}
          </button>

          {remoteCheck && (
            <div className="mt-2 p-2 bg-muted/30 rounded-lg space-y-1">
              <Row
                label="Remote verzija"
                value={remoteCheck.version ?? '❌ Nedostupna'}
              />
              <Row
                label="Izvor"
                value={remoteCheck.origin ?? 'N/A'}
                truncate
              />
              {remoteCheck.error && (
                <Row label="Greška" value={remoteCheck.error} />
              )}
              {remoteCheck.version && (
                <Row
                  label="Status"
                  value={
                    remoteCheck.version === APP_VERSION
                      ? t('runtimeDiagnostics.versionsEqual')
                      : t('runtimeDiagnostics.versionsDiffer', { local: APP_VERSION, remote: remoteCheck.version })
                  }
                />
              )}
            </div>
          )}

          {isNativeApp && (
            <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400">
              {t('runtimeDiagnostics.nativeRebuildHint')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground shrink-0">{label}:</span>
    <span className={`text-foreground text-right ${truncate ? 'truncate max-w-[180px]' : ''}`}>
      {value}
    </span>
  </div>
);
