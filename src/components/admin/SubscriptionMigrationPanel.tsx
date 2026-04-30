import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ArrowUpCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

type MigrationResult = {
  subscription_id: string;
  customer_email: string | null;
  old_price_id: string;
  new_price_id: string;
  old_amount_cents: number;
  action?: string;
  error?: string;
};

type MigrationResponse = {
  dryRun: boolean;
  total: number;
  migrated: MigrationResult[];
  errors: MigrationResult[];
};

export const SubscriptionMigrationPanel = () => {
  const [loading, setLoading] = useState<'dry' | 'live' | null>(null);
  const [result, setResult] = useState<MigrationResponse | null>(null);

  const runMigration = async (dryRun: boolean) => {
    if (!dryRun) {
      const confirmed = window.confirm(
        '⚠️ OVO ĆE STVARNO MIGRIRATI SVE POSTOJEĆE PRETPLATNIKE NA NOVE CIJENE.\n\n' +
        'Stripe će automatski generirati proration invoices.\n' +
        'Ova akcija se NE MOŽE poništiti automatski.\n\n' +
        'Jesi li pokrenuo Dry Run prije ovoga? Nastaviti?'
      );
      if (!confirmed) return;
    }

    setLoading(dryRun ? 'dry' : 'live');
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('migrate-existing-subscriptions', {
        body: { dryRun },
      });
      if (error) throw error;
      setResult(data as MigrationResponse);
      toast({
        title: dryRun ? 'Dry run dovršen' : 'Migracija dovršena',
        description: `${data.total} pretplata${data.errors?.length ? ` · ${data.errors.length} grešaka` : ''}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Greška', description: msg, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Migracija postojećih pretplatnika</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Migrira sve aktivne Stripe pretplate sa starih cijena (€4.99 / €9.99) na nove (€7.99 / €14.99)
        s automatskom proracijom. <strong>Uvijek prvo pokreni Dry Run!</strong>
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => runMigration(true)}
          disabled={loading !== null}
          className="flex-1"
        >
          {loading === 'dry' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Dry Run (preview)
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => runMigration(false)}
          disabled={loading !== null}
          className="flex-1"
        >
          {loading === 'live' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Pokreni migraciju
        </Button>
      </div>

      {result && (
        <div className="space-y-2 mt-3">
          <div className={`text-xs px-3 py-2 rounded-lg ${
            result.dryRun
              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
              : 'bg-green-500/10 text-green-700 dark:text-green-400'
          }`}>
            {result.dryRun ? '🔍 Dry Run' : '✅ Live'} · {result.total} pretplat
            {result.errors.length > 0 && ` · ${result.errors.length} grešaka`}
          </div>

          {result.migrated.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-3 py-2 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {result.dryRun ? 'Bit će migrirano' : 'Migrirano'} ({result.migrated.length})
              </div>
              <div className="max-h-64 overflow-y-auto divide-y">
                {result.migrated.map((m) => (
                  <div key={m.subscription_id} className="px-3 py-2 text-xs">
                    <div className="font-medium truncate">{m.customer_email || m.subscription_id}</div>
                    <div className="text-muted-foreground">
                      {m.old_price_id.slice(-8)} → {m.new_price_id.slice(-8)} · €{(m.old_amount_cents / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="border border-destructive/30 rounded-lg overflow-hidden">
              <div className="bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Greške ({result.errors.length})
              </div>
              <div className="max-h-48 overflow-y-auto divide-y">
                {result.errors.map((e, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <div className="font-medium truncate">{e.customer_email || e.subscription_id}</div>
                    <div className="text-destructive">{e.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
