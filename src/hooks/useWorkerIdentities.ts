/**
 * "Ljudi" — person-level (above project) view of hourly workers.
 *
 * Read-only aggregation over data that already exists:
 *   workers (identity) -> project_workers (engagement) -> work entries / payouts
 *
 * Collaborators (`project_collaborators`) are deliberately NOT queried here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import type { RateHistoryRow, WorkEntryForCost } from '@/lib/workerRateHistory';
import {
  aggregatePerson,
  sortPeopleRows,
  suggestIdentityGroups,
  type EngagementRow,
  type IdentityGroupSuggestion,
  type PayoutRow,
  type PersonAggregate,
  type PersonListRow,
} from '@/lib/workerIdentity';

export interface WorkerIdentity {
  id: string;
  user_id: string;
  business_profile_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  note: string | null;
  linked_user_id: string | null;
  archived_at: string | null;
}

export interface PeopleData {
  people: WorkerIdentity[];
  engagements: EngagementRow[];
  entries: WorkEntryForCost[];
  rateHistory: RateHistoryRow[];
  payouts: PayoutRow[];
  projectNames: Record<string, string>;
}

const EMPTY: PeopleData = {
  people: [],
  engagements: [],
  entries: [],
  rateHistory: [],
  payouts: [],
  projectNames: {},
};

export const useWorkerIdentities = () => {
  const { user } = useAuth();
  const [data, setData] = useState<PeopleData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [peopleRes, projectsRes] = await Promise.all([
        supabase.from('workers').select('*').eq('user_id', user.id),
        supabase.from('projects').select('id, name').eq('user_id', user.id).is('deleted_at', null),
      ]);
      if (peopleRes.error) throw peopleRes.error;
      if (projectsRes.error) throw projectsRes.error;

      const projectNames: Record<string, string> = {};
      for (const p of projectsRes.data ?? []) projectNames[p.id as string] = (p as any).name;
      const projectIds = Object.keys(projectNames);

      let engagements: EngagementRow[] = [];
      let entries: WorkEntryForCost[] = [];
      let rateHistory: RateHistoryRow[] = [];
      let payouts: PayoutRow[] = [];

      if (projectIds.length > 0) {
        const { data: pw, error: pwErr } = await supabase
          .from('project_workers')
          .select('id, project_id, worker_id, first_name, last_name, position, hourly_rate, business_profile_id')
          .in('project_id', projectIds);
        if (pwErr) throw pwErr;
        engagements = (pw ?? []).map((r: any) => ({
          id: r.id,
          project_id: r.project_id ?? null,
          worker_id: r.worker_id ?? null,
          first_name: r.first_name,
          last_name: r.last_name,
          position: r.position,
          hourly_rate: Number(r.hourly_rate) || 0,
          business_profile_id: r.business_profile_id ?? null,
        }));

        const engagementIds = engagements.map((e) => e.id);
        if (engagementIds.length > 0) {
          const [entRes, histRes, payRes] = await Promise.all([
            supabase
              .from('project_work_entries')
              .select('worker_id, work_date, actual_hours, payout_id')
              .in('worker_id', engagementIds),
            supabase
              .from('project_worker_rate_history')
              .select('worker_id, rate, effective_from')
              .in('worker_id', engagementIds),
            supabase
              .from('project_worker_payouts')
              .select('id, worker_id, project_id, batch_id, gross_amount, paid_amount, paid_at, period_start, period_end, status, void_reason, voided_at, deleted_at')
              .in('worker_id', engagementIds),

          ]);
          if (entRes.error) throw entRes.error;
          if (payRes.error) throw payRes.error;
          entries = (entRes.data ?? []).map((e: any) => ({
            worker_id: e.worker_id,
            work_date: e.work_date,
            actual_hours: Number(e.actual_hours) || 0,
            payout_id: e.payout_id ?? null,
          }));
          rateHistory = ((histRes.data ?? []) as any[]).map((r) => ({
            worker_id: r.worker_id,
            rate: Number(r.rate) || 0,
            effective_from: r.effective_from,
          }));
          payouts = (payRes.data ?? []).map((p: any) => ({
            id: p.id,
            worker_id: p.worker_id,
            batch_id: p.batch_id ?? null,
            void_reason: p.void_reason ?? null,
            project_id: p.project_id ?? null,
            paid_amount: Number(p.paid_amount) || 0,
            paid_at: p.paid_at,
            status: p.status ?? null,
            voided_at: p.voided_at ?? null,
            deleted_at: p.deleted_at ?? null,
          }));
        }
      }

      setData({
        people: (peopleRes.data ?? []) as unknown as WorkerIdentity[],
        engagements,
        entries,
        rateHistory,
        payouts,
        projectNames,
      });
    } catch (e: any) {
      setError(e?.message || 'unknown');
      logDiagnostic({
        event: 'worker_identity_fetch_failed',
        severity: 'error',
        details: { message: String(e?.message ?? e), code: e?.code ?? null },
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const engagementsByPerson = useMemo(() => {
    const m = new Map<string, EngagementRow[]>();
    for (const e of data.engagements) {
      if (!e.worker_id) continue;
      const list = m.get(e.worker_id) ?? [];
      list.push(e);
      m.set(e.worker_id, list);
    }
    return m;
  }, [data.engagements]);

  const aggregates = useMemo(() => {
    const m = new Map<string, PersonAggregate>();
    for (const p of data.people) {
      m.set(
        p.id,
        aggregatePerson(engagementsByPerson.get(p.id) ?? [], data.entries, data.rateHistory, data.payouts),
      );
    }
    return m;
  }, [data.people, data.entries, data.rateHistory, data.payouts, engagementsByPerson]);

  const rows: PersonListRow[] = useMemo(
    () =>
      sortPeopleRows(
        data.people
          .filter((p) => !p.archived_at)
          .map((p) => {
            const a = aggregates.get(p.id);
            return {
              workerId: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
              engagementCount: a?.engagementCount ?? 0,
              remaining: a?.totalRemaining ?? 0,
            };
          }),
      ),
    [data.people, aggregates],
  );

  const pendingGroups: IdentityGroupSuggestion[] = useMemo(
    () => suggestIdentityGroups(data.engagements),
    [data.engagements],
  );

  /**
   * Apply a user's answer to one suggestion.
   *  - same === true  -> one identity for the whole group
   *  - same === false -> one identity per engagement (never merged)
   * Nothing is deleted, renamed or re-priced.
   */
  const resolveGroup = useCallback(
    async (group: IdentityGroupSuggestion, same: boolean): Promise<boolean> => {
      if (!user) return false;
      try {
        const targets = same ? [group.engagementIds] : group.engagementIds.map((id) => [id]);
        for (const ids of targets) {
          const source = data.engagements.find((e) => e.id === ids[0]);
          const { data: created, error: insErr } = await supabase
            .from('workers')
            .insert({
              user_id: user.id,
              business_profile_id: group.businessProfileId,
              first_name: source?.first_name ?? group.firstName,
              last_name: source?.last_name ?? group.lastName,
            })
            .select('id')
            .single();
          if (insErr) throw insErr;
          const { error: updErr } = await supabase
            .from('project_workers')
            .update({ worker_id: (created as any).id })
            .in('id', ids);
          if (updErr) throw updErr;
        }
        await fetchAll();
        return true;
      } catch (e: any) {
        logDiagnostic({
          event: 'worker_identity_migration_failed',
          severity: 'error',
          details: {
            group_key: group.key,
            same,
            engagement_ids: group.engagementIds,
            message: String(e?.message ?? e),
            code: e?.code ?? null,
          },
        });
        return false;
      }
    },
    [user, data.engagements, fetchAll],
  );

  return { ...data, aggregates, rows, pendingGroups, loading, error, refetch: fetchAll, resolveGroup };
};
