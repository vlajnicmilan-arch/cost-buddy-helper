/**
 * useActiveIssues
 * Reads active (status='active') notification rows that act as "issues".
 * Subscribes to 'active-issues-changed' window event to refetch.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type IssueSeverity = "info" | "warning" | "critical";

export interface ActiveIssue {
  id: string;
  type: string;
  title: string;     // i18n key (set by reconciler) OR plain text (legacy rows)
  message: string;   // i18n key OR plain text
  severity: IssueSeverity;
  dedup_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  last_seen_at: string;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export const useActiveIssues = (enabled: boolean) => {
  const { user } = useAuth();
  const [issues, setIssues] = useState<ActiveIssue[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user || !enabled) {
      setIssues([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("id, type, title, message, severity, dedup_key, entity_type, entity_id, data, created_at, last_seen_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data || []) as ActiveIssue[];
      rows.sort((a, b) => {
        const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (r !== 0) return r;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setIssues(rows);
    } catch (err) {
      console.error("[useActiveIssues] failed", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, enabled]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const onChange = () => fetch();
    window.addEventListener("active-issues-changed", onChange);
    return () => window.removeEventListener("active-issues-changed", onChange);
  }, [fetch]);

  const dismiss = useCallback(async (id: string) => {
    // Optimistic
    setIssues(prev => prev.filter(i => i.id !== id));
    try {
      await (supabase as any).rpc("dismiss_notification", { p_id: id });
    } catch (err) {
      console.error("[useActiveIssues] dismiss failed", err);
      fetch();
    }
  }, [fetch]);

  return { issues, loading, dismiss, refetch: fetch };
};
