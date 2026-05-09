import { CreditCard, Crown, Briefcase, Star, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubscriptionMigrationPanel } from '@/components/admin/SubscriptionMigrationPanel';
import type { AppUser } from './types';

interface BillingTabProps {
  billingEnabled: boolean;
  billingLoading: boolean;
  onToggleBilling: (enabled: boolean) => void;
  users: AppUser[];
  subscriptions: Record<string, string>;
  subLoading: string | null;
  onSetUserTier: (userId: string, tier: string) => void;
}

export const BillingTab = ({
  billingEnabled,
  billingLoading,
  onToggleBilling,
  users,
  subscriptions,
  subLoading,
  onSetUserTier,
}: BillingTabProps) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 mt-4">
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">{t('admin.globalBilling')}</h3>
              <p className="text-xs text-muted-foreground">Uključi/isključi sustav pretplata za sve korisnike</p>
            </div>
          </div>
          <Switch
            checked={billingEnabled}
            onCheckedChange={onToggleBilling}
            disabled={billingLoading}
          />
        </div>
        <div className={`text-xs px-3 py-2 rounded-lg ${billingEnabled ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
          {billingEnabled ? '✓ Naplata je aktivna — korisnici vide ograničenja prema razini' : '○ Naplata je isključena — svi korisnici imaju puni pristup'}
        </div>
      </div>

      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">{t('admin.userTiers')}</h3>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Učitajte korisnike na tabu "Korisnici"</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const currentTier = subscriptions[u.id] || 'free';
              const TierIcon = currentTier === 'business' ? Briefcase : currentTier === 'pro' ? Star : User;
              return (
                <div key={u.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <TierIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.display_name || u.email}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <Select
                    value={currentTier}
                    onValueChange={(val) => onSetUserTier(u.id, val)}
                    disabled={subLoading === u.id}
                  >
                    <SelectTrigger className="w-[110px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SubscriptionMigrationPanel />

      <p className="text-xs text-muted-foreground text-center">
        Stripe migracija: prvo Dry Run, zatim live. Postojeći trialovi se ne diraju.
      </p>
    </div>
  );
};
