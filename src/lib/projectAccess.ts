// =============================================================
// PR1: Module Access Model v2 — pure helpers
// =============================================================
// Bez React imports — koristi se i u testovima i u hookovima.

export type ProjectAccessLevel =
  | 'owner_subscriber'   // owner s aktivnom Projects pretplatom → full write
  | 'owner_readonly'     // owner bez pretplate → read-only (downgrade)
  | 'participant'        // član projekta, nije owner
  | 'none';              // bez pristupa

export interface ProjectAccessInput {
  projectUserId: string | null | undefined;
  currentUserId: string | null | undefined;
  isProjectsSubscriber: boolean;
  isParticipant?: boolean;
}

/**
 * Determinira razinu pristupa korisnika za projekt.
 * NAPOMENA: trial nije podržan dok ne uvedemo pravi DB source-of-truth.
 */
export function resolveProjectAccessLevel(input: ProjectAccessInput): ProjectAccessLevel {
  const { projectUserId, currentUserId, isProjectsSubscriber, isParticipant } = input;
  if (!currentUserId) return 'none';
  if (projectUserId && projectUserId === currentUserId) {
    return isProjectsSubscriber ? 'owner_subscriber' : 'owner_readonly';
  }
  if (isParticipant) return 'participant';
  return 'none';
}

export interface ProjectLike {
  id: string;
  user_id: string | null;
  name: string;
  business_profile_id?: string | null;
}

export interface BusinessProfileLite {
  id: string;
  company_name: string | null;
}

export interface ProjectGroup {
  /** Stabilan kljuc grupe ('personal', 'orphan', ili business profile id). */
  key: string;
  /** Naziv grupe (lokaliziran ili naziv tvrtke). Caller daje 'personal' label. */
  label: string;
  /** 'personal' | 'business' | 'orphan' — UI moze birati ikonu/badge. */
  kind: 'personal' | 'business' | 'orphan';
  projects: ProjectLike[];
}

/**
 * Grupira projekte po kontekstu.
 * - business_profile_id == null  → grupa 'personal'
 * - business_profile_id postoji i nalazi se u dostupnim profilima → grupa po profilu
 * - business_profile_id postoji ali profil NIJE dostupan korisniku
 *   (npr. participant bez Business modula) → SVJESNA produktna odluka:
 *   ide u grupu 'orphan' (default: "Osobni projekti")
 *
 * Naziv tvrtke za business grupu (npr. za participant minimalni kontekst) treba
 * dodatno proci kroz `getBusinessGroupLabel`.
 */
export function groupProjectsByContext(
  projects: ProjectLike[],
  availableProfiles: BusinessProfileLite[],
  labels: { personal: string; orphan: string },
): ProjectGroup[] {
  const profileById = new Map(availableProfiles.map((p) => [p.id, p]));
  const personal: ProjectLike[] = [];
  const orphan: ProjectLike[] = [];
  const byBusiness = new Map<string, ProjectLike[]>();

  for (const p of projects) {
    if (!p.business_profile_id) {
      personal.push(p);
      continue;
    }
    if (!profileById.has(p.business_profile_id)) {
      orphan.push(p);
      continue;
    }
    const list = byBusiness.get(p.business_profile_id) ?? [];
    list.push(p);
    byBusiness.set(p.business_profile_id, list);
  }

  const groups: ProjectGroup[] = [];
  if (personal.length > 0) {
    groups.push({ key: 'personal', label: labels.personal, kind: 'personal', projects: personal });
  }
  for (const [bpId, list] of byBusiness) {
    const profile = profileById.get(bpId)!;
    groups.push({
      key: bpId,
      label: profile.company_name?.trim() || labels.personal,
      kind: 'business',
      projects: list,
    });
  }
  if (orphan.length > 0) {
    groups.push({ key: 'orphan', label: labels.orphan, kind: 'orphan', projects: orphan });
  }
  return groups;
}
