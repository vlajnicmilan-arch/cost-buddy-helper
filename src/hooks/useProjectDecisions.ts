import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError } from '@/hooks/useStatusFeedback';
import { compressImageFile, ATTACHMENT_COMPRESS } from '@/lib/imageCompress';
import {
  isImageAttachment,
  validateDecisionAttachment,
} from '@/lib/decisionAttachments';
import type {
  DecisionAction,
  DecisionActorRole,
  DecisionClosedReason,
  DecisionStatus,
  DecisionStep,
} from '@/lib/projectDecisionStateMachine';

const BUCKET = 'project-documents';

export interface DecisionAttachment {
  id: string;
  decision_id: string;
  step_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export interface ProjectDecision {
  id: string;
  project_id: string;
  created_by: string;
  title: string;
  initial_description: string;
  initial_price: number | null;
  current_status: DecisionStatus;
  closed_reason: DecisionClosedReason;
  closed_at: string | null;
  /** Faza 2 — set kad after-trigger stvori aneks (null inače). */
  contract_amendment_id: string | null;
  created_at: string;
  updated_at: string;
  steps: DecisionStep[];
  /** Faza 3 — prilozi grupirani po odluci; vezanje na korake preko step_id. */
  attachments: DecisionAttachment[];
}

interface RawStepRow {
  id: string;
  decision_id: string;
  step_no: number;
  actor_user_id: string;
  actor_role: DecisionActorRole;
  action: DecisionAction;
  message: string | null;
  price: number | string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Attachment upload helpers (Faza 3)
// ─────────────────────────────────────────────────────────────

interface StagedAttachment {
  file: File;
  originalName: string;
  storagePath: string;
  rowId: string; // uuid inserted attachment row
}

const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_');

const uploadAttachments = async (opts: {
  projectId: string;
  decisionId: string;
  userId: string;
  files: File[];
}): Promise<StagedAttachment[]> => {
  const staged: StagedAttachment[] = [];
  const cleanup = async () => {
    if (staged.length === 0) return;
    // Best-effort cleanup
    try {
      await supabase.storage.from(BUCKET).remove(staged.map((s) => s.storagePath));
    } catch (err) { console.warn('[decisions] storage cleanup failed', err); }
    try {
      await supabase
        .from('project_decision_attachments' as never)
        .delete()
        .in('id', staged.map((s) => s.rowId));
    } catch (err) { console.warn('[decisions] row cleanup failed', err); }
  };

  try {
    for (const rawFile of opts.files) {
      const validation = validateDecisionAttachment({
        type: rawFile.type,
        name: rawFile.name,
        size: rawFile.size,
      });
      if (!validation.ok) {
        throw new Error(validation.reason || 'invalid_attachment');
      }

      const file = isImageAttachment(rawFile)
        ? await compressImageFile(rawFile, ATTACHMENT_COMPRESS)
        : rawFile;

      const filename = `${Date.now()}_${sanitize(file.name)}`;
      const storagePath = `${opts.projectId}/decisions/${opts.decisionId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from('project_decision_attachments' as never)
        .insert({
          decision_id: opts.decisionId,
          storage_path: storagePath,
          file_name: rawFile.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          uploaded_by: opts.userId,
        } as never)
        .select('id')
        .single();
      if (insErr) throw insErr;

      staged.push({
        file,
        originalName: rawFile.name,
        storagePath,
        rowId: (row as { id: string }).id,
      });
    }
    return staged;
  } catch (e) {
    await cleanup();
    throw e;
  }
};

const linkAttachmentsToStep = async (rowIds: string[], stepId: string): Promise<void> => {
  if (rowIds.length === 0) return;
  const { error } = await supabase
    .from('project_decision_attachments' as never)
    .update({ step_id: stepId } as never)
    .in('id', rowIds);
  if (error) throw error;
};

const cleanupStaged = async (staged: StagedAttachment[]) => {
  if (staged.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(staged.map((s) => s.storagePath));
  } catch {}
  try {
    await supabase
      .from('project_decision_attachments' as never)
      .delete()
      .in('id', staged.map((s) => s.rowId));
  } catch {}
};

// ─────────────────────────────────────────────────────────────

export function useProjectDecisions(projectId: string | null) {
  const { user } = useAuth();
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!projectId || !user) {
      setDecisions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: decs, error: decErr } = await supabase
        .from('project_decisions' as never)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (decErr) throw decErr;

      const rows = (decs ?? []) as unknown as ProjectDecision[];
      if (rows.length === 0) { setDecisions([]); return; }

      const ids = rows.map((d) => d.id);

      const [stepsRes, attRes] = await Promise.all([
        supabase
          .from('project_decision_steps' as never)
          .select('*')
          .in('decision_id', ids)
          .order('step_no', { ascending: true }),
        supabase
          .from('project_decision_attachments' as never)
          .select('*')
          .in('decision_id', ids)
          .order('created_at', { ascending: true }),
      ]);
      if (stepsRes.error) throw stepsRes.error;
      if (attRes.error) throw attRes.error;

      const byDecisionSteps = new Map<string, DecisionStep[]>();
      // Za mapping u UI slojevima trebamo i step.id (nije bio u prethodnoj shemi).
      const stepIdByDecisionStepNo = new Map<string, Map<number, string>>();
      ((stepsRes.data ?? []) as unknown as RawStepRow[]).forEach((s) => {
        const arr = byDecisionSteps.get(s.decision_id) ?? [];
        arr.push({
          step_no: s.step_no,
          actor_user_id: s.actor_user_id,
          actor_role: s.actor_role,
          action: s.action,
          message: s.message,
          price: s.price != null ? Number(s.price) : null,
          created_at: s.created_at,
        });
        byDecisionSteps.set(s.decision_id, arr);
        const inner = stepIdByDecisionStepNo.get(s.decision_id) ?? new Map();
        inner.set(s.step_no, s.id);
        stepIdByDecisionStepNo.set(s.decision_id, inner);
      });

      const byDecisionAtts = new Map<string, DecisionAttachment[]>();
      ((attRes.data ?? []) as unknown as DecisionAttachment[]).forEach((a) => {
        const arr = byDecisionAtts.get(a.decision_id) ?? [];
        arr.push(a);
        byDecisionAtts.set(a.decision_id, arr);
      });

      setDecisions(rows.map((d) => ({
        ...d,
        steps: byDecisionSteps.get(d.id) ?? [],
        attachments: byDecisionAtts.get(d.id) ?? [],
      })));
    } catch (e) {
      console.error('[useProjectDecisions] fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime — refetch na svaku promjenu koraka/odluka/priloga za projekt
  useEffect(() => {
    if (!projectId || !user) return;
    const channel = supabase
      .channel(`project-decisions-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_decisions', filter: `project_id=eq.${projectId}` },
        () => { fetchAll(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_decision_steps' },
        () => { fetchAll(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_decision_attachments' },
        () => { fetchAll(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, user, fetchAll]);

  const createDecision = useCallback(async (input: {
    title: string;
    initial_description: string;
    /** Faza 2 — opcionalna cijena za prvi propose korak. Ne-null vrijednost ne smije biti 0. */
    price?: number | null;
    /** Faza 3 — prilozi za prvi propose korak (max 3). */
    attachments?: File[];
  }): Promise<{ ok: boolean; id?: string }> => {
    if (!projectId || !user) return { ok: false };

    // 1) Insert decision (bez koraka)
    const { data: decData, error: decErr } = await supabase
      .from('project_decisions' as never)
      .insert({
        project_id: projectId,
        created_by: user.id,
        title: input.title.trim(),
        initial_description: input.initial_description.trim(),
        initial_price: input.price ?? null,
      } as never)
      .select('id')
      .single();
    if (decErr) {
      console.error('[useProjectDecisions] createDecision (decision insert)', decErr);
      showError('Neuspješno stvaranje odluke');
      return { ok: false };
    }
    const decisionId = (decData as { id: string }).id;

    // 2) Upload priloga (prije insert-a koraka; ako padne, brišemo odluku)
    let staged: StagedAttachment[] = [];
    try {
      if (input.attachments && input.attachments.length > 0) {
        staged = await uploadAttachments({
          projectId,
          decisionId,
          userId: user.id,
          files: input.attachments,
        });
      }
    } catch (e) {
      console.error('[useProjectDecisions] attachment upload failed', e);
      showError('Neuspješan upload priloga — prijedlog nije spremljen');
      // Rollback decision
      try {
        await supabase.from('project_decisions' as never).delete().eq('id', decisionId);
      } catch {}
      return { ok: false };
    }

    // 3) Insert step #1 (propose)
    const { data: stepRow, error: stepErr } = await supabase
      .from('project_decision_steps' as never)
      .insert({
        decision_id: decisionId,
        actor_user_id: user.id,
        actor_role: 'owner',
        action: 'propose',
        message: input.initial_description.trim(),
        price: input.price ?? null,
        step_no: 1,
      } as never)
      .select('id')
      .single();
    if (stepErr) {
      console.error('[useProjectDecisions] createDecision (step insert)', stepErr);
      await cleanupStaged(staged);
      try {
        await supabase.from('project_decisions' as never).delete().eq('id', decisionId);
      } catch {}
      showError('Neuspješno stvaranje koraka');
      return { ok: false };
    }

    // 4) Link priloga na step
    if (staged.length > 0) {
      try {
        await linkAttachmentsToStep(staged.map((s) => s.rowId), (stepRow as { id: string }).id);
      } catch (e) {
        console.error('[useProjectDecisions] link attachments failed', e);
        // Odluka i korak stoje; prilozi ostaju uploadani ali nespojeni — best-effort delete
        await cleanupStaged(staged);
        showError('Prilozi nisu spojeni na korak — pokušaj ponovo');
      }
    }

    await fetchAll();
    return { ok: true, id: decisionId };
  }, [projectId, user, fetchAll]);

  const addStep = useCallback(async (input: {
    decisionId: string;
    action: DecisionAction;
    message?: string;
    /** Faza 2 — cijena samo za propose/counter/correction; accept/reject moraju biti null. */
    price?: number | null;
    /** Faza 3 — prilozi (samo za propose/counter/correction; max 3). */
    attachments?: File[];
  }): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false };
    if (!projectId) return { ok: false };

    const carriesPrice = input.action === 'counter' || input.action === 'correction' || input.action === 'propose';
    const carriesAttachments = carriesPrice;

    // 1) Upload prije step insert-a
    let staged: StagedAttachment[] = [];
    try {
      if (carriesAttachments && input.attachments && input.attachments.length > 0) {
        staged = await uploadAttachments({
          projectId,
          decisionId: input.decisionId,
          userId: user.id,
          files: input.attachments,
        });
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'attachment_upload_failed';
      console.error('[useProjectDecisions] attachment upload failed', e);
      showError('Neuspješan upload priloga — korak nije zapisan');
      return { ok: false, error: msg };
    }

    // 2) Insert step
    const { data: stepRow, error } = await supabase
      .from('project_decision_steps' as never)
      .insert({
        decision_id: input.decisionId,
        actor_user_id: user.id,
        actor_role: 'owner',
        action: input.action,
        message: input.message?.trim() || null,
        price: carriesPrice ? (input.price ?? null) : null,
        step_no: 999,
      } as never)
      .select('id')
      .single();

    if (error) {
      const msg = (error as { message?: string })?.message ?? 'unknown';
      console.error('[useProjectDecisions] addStep', error);
      await cleanupStaged(staged);
      showError(msg);
      return { ok: false, error: msg };
    }

    // 3) Link priloga
    if (staged.length > 0) {
      try {
        await linkAttachmentsToStep(staged.map((s) => s.rowId), (stepRow as { id: string }).id);
      } catch (e) {
        console.error('[useProjectDecisions] link attachments failed', e);
        await cleanupStaged(staged);
        showError('Prilozi nisu spojeni na korak — pokušaj ponovo');
      }
    }

    await fetchAll();
    return { ok: true };
  }, [projectId, user, fetchAll]);

  /**
   * Faza 3: dohvat signed URL-a za prikaz/pruzimanje priloga.
   * Vraća null ako signed URL ne uspije.
   */
  const getAttachmentUrl = useCallback(async (att: DecisionAttachment): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(att.storage_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    } catch (e) {
      console.error('[useProjectDecisions] signed url failed', e);
      return null;
    }
  }, []);

  return { decisions, loading, refetch: fetchAll, createDecision, addStep, getAttachmentUrl };
}
