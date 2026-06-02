import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { resolveProjectAccessLevel, type ProjectAccessLevel } from '@/lib/projectAccess';

interface ProjectInput {
  user_id: string | null | undefined;
  /** True ako je trenutni korisnik član projekta (project_members) ali nije owner. */
  isParticipant?: boolean;
}

/**
 * Vraca razinu pristupa trenutnog korisnika za zadani projekt.
 * Owner downgrade → 'owner_readonly' (RLS i UI gate).
 *
 * NAPOMENA: trial nije podržan dok DB ne dobije pravi source-of-truth.
 * Trenutno se subscriber=true racuna iz tier in (pro,business) OR lifetime.
 */
export function useProjectAccessLevel(project: ProjectInput | null | undefined): ProjectAccessLevel {
  const { user } = useAuth();
  const { hasAccess } = useFeatureAccess();
  return useMemo(() => {
    if (!project) return 'none';
    return resolveProjectAccessLevel({
      projectUserId: project.user_id ?? null,
      currentUserId: user?.id ?? null,
      // 'projects' feature gate vec mapira pro/business → kompatibilno s DB is_projects_subscriber
      isProjectsSubscriber: hasAccess('projects'),
      isParticipant: project.isParticipant ?? false,
    });
  }, [project, user?.id, hasAccess]);
}

export function isReadOnlyAccess(level: ProjectAccessLevel): boolean {
  return level === 'owner_readonly' || level === 'participant';
}
