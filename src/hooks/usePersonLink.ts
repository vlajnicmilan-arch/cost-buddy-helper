/**
 * Person-level Centar account link (Ljudi).
 *
 * The link is stored on the PERSON (`workers.linked_user_id`) and propagated to
 * every engagement by database triggers. It grants NO app access — access still
 * comes exclusively from project members.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export interface PersonLinkResult {
  ok: boolean;
  engagementsLinked: number;
  skippedProjects: string[];
  dbCode?: string | null;
  dbMessage?: string | null;
}

const parse = (data: unknown): { linked: boolean; engagements: number; skipped: string[] } => {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    linked: d.linked === true,
    engagements: Number(d.engagements_linked ?? 0) || 0,
    skipped: Array.isArray(d.skipped_projects) ? (d.skipped_projects as string[]) : [],
  };
};

export const usePersonLink = () => {
  const [pending, setPending] = useState(false);

  const run = useCallback(async (personId: string, userId: string | null): Promise<PersonLinkResult> => {
    setPending(true);
    try {
      const { data, error } = await (supabase.rpc as any)('link_person_to_user', {
        p_person_id: personId,
        p_user_id: userId,
      });
      if (error) {
        logDiagnostic({
          event: userId ? 'person_link_failed' : 'person_unlink_failed',
          severity: 'error',
          details: {
            person_id: personId,
            user_id: userId,
            db_code: error.code ?? null,
            db_message: error.message,
          },
        });
        return { ok: false, engagementsLinked: 0, skippedProjects: [], dbCode: error.code ?? null, dbMessage: error.message };
      }
      const parsed = parse(data);
      logDiagnostic({
        event: userId ? 'person_link_ok' : 'person_unlink_ok',
        severity: 'info',
        details: {
          person_id: personId,
          user_id: userId,
          engagements: parsed.engagements,
          skipped_projects: parsed.skipped.length,
        },
      });
      return { ok: true, engagementsLinked: parsed.engagements, skippedProjects: parsed.skipped };
    } finally {
      setPending(false);
    }
  }, []);

  const linkPerson = useCallback((personId: string, userId: string) => run(personId, userId), [run]);
  const unlinkPerson = useCallback((personId: string) => run(personId, null), [run]);

  return { linkPerson, unlinkPerson, pending };
};
