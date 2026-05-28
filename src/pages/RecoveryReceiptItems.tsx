/**
 * /recovery/receipt-items
 *
 * Privremena, skrivena stranica za vraćanje artikala koji su skenirani
 * lokalno ali nikad nisu stigli u cloud. Read-only inventura → ručna potvrda
 * → ciljani insert u `receipt_items`. Nikakvih bulk operacija.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import {
  buildRecoveryPairs,
  restoreItemsForPair,
  type RecoveryPair,
  type RestoreResult,
} from '@/lib/receiptRecovery';

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(2);
}

function statusBadge(p: RecoveryPair) {
  const map: Record<RecoveryPair['status'], { text: string; cls: string }> = {
    safe_to_restore: { text: 'Spremno za vraćanje', cls: 'bg-primary/15 text-primary' },
    has_items_already: { text: 'Već ima artikle', cls: 'bg-muted text-muted-foreground' },
    no_match: { text: 'Nema parnjaka', cls: 'bg-destructive/15 text-destructive' },
    multiple_candidates: { text: 'Više kandidata', cls: 'bg-amber-500/15 text-amber-600' },
    merchant_mismatch: { text: 'Provjeri opis', cls: 'bg-amber-500/15 text-amber-600' },
  };
  const b = map[p.status];
  return <span className={`text-[11px] px-2 py-0.5 rounded ${b.cls}`}>{b.text}</span>;
}

export default function RecoveryReceiptItems() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<RecoveryPair[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [restoring, setRestoring] = useState(false);
  const [results, setResults] = useState<RestoreResult[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await buildRecoveryPairs();
        if (!alive) return;
        setPairs(data);
        // Pre-select all safe_to_restore pairs.
        const sel: Record<string, boolean> = {};
        for (const p of data) {
          if (p.status === 'safe_to_restore') sel[p.local.key] = true;
        }
        setSelected(sel);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (key: string) =>
    setSelected((s) => ({ ...s, [key]: !s[key] }));

  const selectedPairs = pairs.filter(
    (p) =>
      selected[p.local.key] &&
      (p.status === 'safe_to_restore' ||
        p.status === 'merchant_mismatch' ||
        p.status === 'multiple_candidates') &&
      p.candidate
  );

  const runRestore = async () => {
    setRestoring(true);
    const out: RestoreResult[] = [];
    for (const p of selectedPairs) {
      try {
        const r = await restoreItemsForPair(p);
        out.push(r);
      } catch (e: any) {
        out.push({
          key: p.local.key,
          expenseId: p.candidate?.id ?? '',
          inserted: 0,
          error: e?.message || String(e),
        });
      }
    }
    setResults(out);
    setRestoring(false);
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh p-4 bg-background">
        <Card className="p-4 border-destructive">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <div className="font-semibold text-destructive">Greška</div>
              <div className="text-sm text-muted-foreground break-all">{error}</div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const safeCount = pairs.filter((p) => p.status === 'safe_to_restore').length;
  const totalItems = pairs.reduce((s, p) => s + p.local.itemCount, 0);

  return (
    <div className="min-h-dvh p-4 bg-background pb-24">
      <h1 className="text-xl font-semibold mb-1">Vraćanje artikala s računa</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Read-only inventura. Ništa se ne sprema dok eksplicitno ne klikneš na gumb.
      </p>

      <Card className="p-3 mb-4 text-sm space-y-1">
        <div>
          Lokalnih zapisa s artiklima:{' '}
          <span className="font-semibold">{pairs.length}</span> (ukupno {totalItems} artikala)
        </div>
        <div>
          Spremno za vraćanje:{' '}
          <span className="font-semibold text-primary">{safeCount}</span>
        </div>
      </Card>

      {pairs.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          Nema lokalnog cachea s artiklima na ovom uređaju. Provjeri jesi li
          ulogiran u istom računu kao kad si skenirao.
        </Card>
      )}

      <div className="space-y-2">
        {pairs.map((p) => {
          const sel = !!selected[p.local.key];
          const canSelect = p.status === 'safe_to_restore';
          const dt = new Date(p.local.timestampMs);
          return (
            <Card key={p.local.key} className="p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={sel}
                  disabled={!canSelect}
                  onCheckedChange={() => canSelect && toggle(p.local.key)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">
                      {p.local.merchant || '(bez naziva)'} · {fmt(p.local.amount)} €
                    </div>
                    {statusBadge(p)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Skenirano: {dt.toLocaleString('hr-HR')} · datum računa:{' '}
                    {p.local.date || '—'} · {p.local.itemCount} artikala
                  </div>

                  {p.candidate && (
                    <div className="text-xs mt-1 p-2 bg-muted/40 rounded">
                      <div>
                        Cloud kandidat:{' '}
                        <span className="font-mono">{p.candidate.id.slice(0, 8)}</span>{' '}
                        · {p.candidate.date} · {fmt(p.candidate.amount)} €
                      </div>
                      <div className="truncate text-muted-foreground">
                        {p.candidate.description || '(bez opisa)'}
                      </div>
                      <div className="text-muted-foreground">
                        Postojeći artikli: {p.candidate.existing_item_count}
                      </div>
                    </div>
                  )}

                  {p.reason && (
                    <div className="text-xs text-amber-600 mt-1">{p.reason}</div>
                  )}

                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      Artikli ({p.local.itemCount})
                    </summary>
                    <ul className="text-xs mt-1 space-y-0.5">
                      {p.local.items.slice(0, 20).map((it, idx) => (
                        <li key={idx} className="flex justify-between gap-2">
                          <span className="truncate">{it.name || '(bez naziva)'}</span>
                          <span className="text-muted-foreground shrink-0">
                            {fmt(it.total_price)} €
                          </span>
                        </li>
                      ))}
                      {p.local.items.length > 20 && (
                        <li className="text-muted-foreground">
                          +{p.local.items.length - 20} više
                        </li>
                      )}
                    </ul>
                  </details>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {results && (
        <Card className="mt-4 p-3">
          <div className="font-semibold mb-2">Rezultat</div>
          <ul className="text-sm space-y-1">
            {results.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                {r.error ? (
                  <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">
                    {r.expenseId.slice(0, 8) || '(bez ID-a)'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.error
                      ? `Greška: ${r.error}`
                      : `Vraćeno ${r.inserted} artikala`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {selectedPairs.length > 0 && !results && (
        <div className="fixed bottom-4 left-4 right-4 z-50">
          <Button
            className="w-full h-12"
            disabled={restoring}
            onClick={runRestore}
          >
            {restoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Vraćam…
              </>
            ) : (
              `Vrati artikle za ${selectedPairs.length} računa`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
