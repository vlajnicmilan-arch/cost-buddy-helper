import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useAdminUserEntitlements } from '@/hooks/useAdminUserEntitlements';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import {
  entitlementSourceLabelKey,
  moduleLabelKey,
  type AdminEntitlementModule,
} from '@/lib/adminEntitlements';

interface Props {
  userId: string;
}

/**
 * Prava po modulu — jedan izvor istine (`user_entitlements`) koji vide i
 * klijent i RLS. Uključivanje upisuje `source='admin_grant'`, isključivanje
 * postavlja `status='revoked'` (redak ostaje).
 */
export const UserModuleEntitlementsSection = ({ userId }: Props) => {
  const { t } = useTranslation();
  const { states, loading, busyModule, setModule } = useAdminUserEntitlements(userId);
  const [expiry, setExpiry] = useState<Record<string, string>>({});

  const onToggle = async (module: AdminEntitlementModule, enabled: boolean) => {
    try {
      await setModule(module, enabled, expiry[module] ?? null);
      showSuccess(
        enabled
          ? t('admin.entitlements.enabled', 'Modul uključen')
          : t('admin.entitlements.disabled', 'Modul isključen'),
      );
    } catch (e) {
      showError(
        e instanceof Error ? e.message : t('admin.entitlements.error', 'Greška pri spremanju prava'),
      );
    }
  };

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t('admin.entitlements.title', 'Prava po modulu')}
        </p>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        {t(
          'admin.entitlements.note',
          'Isti izvor istine koji vide aplikacija i baza. Uključivanje upisuje pravo, isključivanje ga opoziva (zapis ostaje).',
        )}
      </p>

      <div className="divide-y">
        {states.map((s) => (
          <div key={s.module} className="py-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">{t(moduleLabelKey(s.module))}</p>
                <p className="text-[10px] text-muted-foreground">
                  {s.active
                    ? `${t('admin.entitlements.stateActive', 'Aktivno')} · ${
                        s.source ? t(entitlementSourceLabelKey(s.source)) : '—'
                      }${
                        s.period_end
                          ? ` · ${t('admin.user.until', 'do')} ${new Date(s.period_end).toLocaleDateString()}`
                          : ''
                      }`
                    : t('admin.entitlements.stateInactive', 'Nije aktivno')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {busyModule === s.module && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
                <Switch
                  checked={s.adminGrantActive}
                  disabled={busyModule === s.module}
                  onCheckedChange={(v) => onToggle(s.module, v)}
                  aria-label={t(moduleLabelKey(s.module))}
                />
              </div>
            </div>
            {!s.adminGrantActive && (
              <Input
                type="date"
                className="h-7 text-[11px]"
                value={expiry[s.module] ?? ''}
                onChange={(e) => setExpiry((p) => ({ ...p, [s.module]: e.target.value }))}
                placeholder={t('admin.entitlements.expiryPlaceholder', 'Istek (neobavezno)')}
                aria-label={t('admin.entitlements.expiryLabel', 'Datum isteka')}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
