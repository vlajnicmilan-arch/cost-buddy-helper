// TEMPORARY AUDIT TOOL — delete after verdict
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, ArrowLeft, Copy, ShieldAlert } from 'lucide-react';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

const MILAN_UID = 'd4d31ee6-5f6b-4059-8c87-b595b394f56b';

type Verdict = {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  severity?: string;
  surface?: string;
  role?: string;
  note?: string;
};

type Report = {
  started_at: string;
  finished_at: string;
  part: number;
  fatal: string | null;
  baseline_parity: { ok: boolean; tables: Record<string, { before: number; after: number; delta: number }> };
  totals: { total: number; pass: number; fail: number; skip: number; critical_fails: number };
  red_candidates: Record<string, { desc: string; verdict: string; evidence: string; severity?: string }>;
  specs: { spec: string; results: Verdict[]; error?: string }[];
};

const AdminSecurityAudit = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState<Record<number, Report>>({});

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.id !== MILAN_UID) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const runPart = async (part: number) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-security-audit', {
        body: { part },
        headers: {},
      });
      // functions.invoke ignores query string; call fetch directly for ?part=
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('no session');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-security-audit?part=${part}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setReports(prev => ({ ...prev, [part]: json as Report }));
      showSuccess(`Part ${part} završen`);
    } catch (e) {
      showError(`Greška: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const runAll = async () => {
    for (const p of [1, 2, 3]) {
      if (running) break;
      await runPart(p);
    }
  };

  const copyReport = async () => {
    const combined = JSON.stringify(reports, null, 2);
    try {
      await navigator.clipboard.writeText(combined);
      showSuccess('Izvještaj kopiran');
    } catch {
      showError('Kopiranje nije uspjelo');
    }
  };

  if (authLoading || !user) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin" /></div>;
  }
  if (user.id !== MILAN_UID) return null;

  const combinedTotals = Object.values(reports).reduce(
    (acc, r) => ({
      total: acc.total + r.totals.total,
      pass: acc.pass + r.totals.pass,
      fail: acc.fail + r.totals.fail,
      critical_fails: acc.critical_fails + r.totals.critical_fails,
    }),
    { total: 0, pass: 0, fail: 0, critical_fails: 0 },
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Security Audit (jednokratno)</h1>
      </div>

      <Card className="p-4 mb-4">
        <p className="text-sm text-muted-foreground mb-3">
          Pokreće adversarial RLS/edge/RPC pakete pod sintetičkim security+a@ / security+b@
          korisnicima. Baseline count živih tablica prije/poslije. Bez izmjena koda —
          samo presuda. Ako se runtime blizu 150s, dijeli na partove.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => runPart(1)} disabled={running}>Part 1 (01–03)</Button>
          <Button onClick={() => runPart(2)} disabled={running}>Part 2 (04–05)</Button>
          <Button onClick={() => runPart(3)} disabled={running}>Part 3 (06–07)</Button>
          <Button variant="secondary" onClick={runAll} disabled={running}>Sve odjednom</Button>
          {Object.keys(reports).length > 0 && (
            <Button variant="outline" onClick={copyReport} className="ml-auto">
              <Copy className="h-4 w-4 mr-2" /> Kopiraj izvještaj
            </Button>
          )}
          {running && <Loader2 className="animate-spin ml-2 h-5 w-5" />}
        </div>
      </Card>

      {Object.keys(reports).length > 0 && (
        <Card className="p-4 mb-4">
          <h2 className="font-semibold mb-2">Kumulativno</h2>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>Total: <b>{combinedTotals.total}</b></div>
            <div className="text-emerald-600">PASS: <b>{combinedTotals.pass}</b></div>
            <div className="text-red-600">FAIL: <b>{combinedTotals.fail}</b></div>
            <div className="text-red-700">CRITICAL FAILs: <b>{combinedTotals.critical_fails}</b></div>
          </div>
        </Card>
      )}

      {Object.entries(reports).sort(([a], [b]) => Number(a) - Number(b)).map(([part, r]) => (
        <Card key={part} className="p-4 mb-4">
          <h2 className="font-semibold mb-2">Part {part}</h2>
          {r.fatal && <div className="text-red-600 text-sm mb-2">FATAL: {r.fatal}</div>}
          <div className="text-sm mb-2">
            Parity: {r.baseline_parity.ok
              ? <span className="text-emerald-600 font-medium">OK (svi delta = 0)</span>
              : <span className="text-red-600 font-medium">VIOLATION</span>}
            {!r.baseline_parity.ok && (
              <pre className="text-xs bg-muted p-2 mt-1 rounded overflow-x-auto">
                {JSON.stringify(r.baseline_parity.tables, null, 2)}
              </pre>
            )}
          </div>

          <div className="text-sm mb-3">
            <b>Red candidates (investor scope):</b>
            <ul className="mt-1 space-y-1">
              {Object.entries(r.red_candidates).map(([k, c]) => (
                <li key={k} className="flex flex-wrap items-baseline gap-2">
                  <span className={c.verdict === 'POTVRĐEN' ? 'text-red-600 font-semibold' :
                    c.verdict === 'OBOREN' ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}>
                    [{c.verdict}]
                  </span>
                  <span>{c.desc}</span>
                  <span className="text-xs text-muted-foreground">→ {c.evidence}</span>
                </li>
              ))}
            </ul>
          </div>

          {r.specs.map((s) => (
            <div key={s.spec} className="border-t pt-2 mt-2">
              <div className="font-medium text-sm">{s.spec} {s.error && <span className="text-red-600">({s.error})</span>}</div>
              <ul className="text-xs mt-1 space-y-0.5">
                {s.results.map((v, i) => (
                  <li key={i} className={
                    v.status === 'FAIL' ? 'text-red-600' :
                    v.status === 'PASS' ? 'text-emerald-700' : 'text-muted-foreground'
                  }>
                    [{v.status}{v.severity ? `/${v.severity}` : ''}] {v.name}
                    {v.note && <span className="text-muted-foreground"> — {v.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Sirovi JSON</summary>
            <pre className="text-xs bg-muted p-2 mt-1 rounded overflow-x-auto max-h-96">
              {JSON.stringify(r, null, 2)}
            </pre>
          </details>
        </Card>
      ))}
    </div>
  );
};

export default AdminSecurityAudit;
