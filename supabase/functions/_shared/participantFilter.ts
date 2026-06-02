// Splits a project recipient list into:
//  - instant: users who should receive an instant push (owner + Projects subscribers)
//  - digestOnly: Core participants (project members without their own Projects subscription)
//                — these must NOT receive instant push; they are covered by the daily
//                participant digest (enqueue_participant_digest_event).
//
// On any failure, falls back to "instant for everyone" so that we never silently
// lose a notification. The digest enqueue path still runs in parallel.
export async function splitInstantVsDigest(
  supabaseAdmin: any,
  projectOwnerId: string,
  candidateUserIds: string[],
): Promise<{ instant: string[]; digestOnly: string[] }> {
  const unique = Array.from(new Set(candidateUserIds.filter(Boolean)));
  if (unique.length === 0) {
    return { instant: [], digestOnly: [] };
  }

  // Owner is always treated as instant — they steer the project, not a participant.
  const ownerSet = new Set<string>([projectOwnerId]);
  const nonOwner = unique.filter((u) => !ownerSet.has(u));

  if (nonOwner.length === 0) {
    return {
      instant: unique.filter((u) => ownerSet.has(u)),
      digestOnly: [],
    };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('filter_projects_subscribers', {
      p_user_ids: nonOwner,
    });
    if (error) throw error;

    const subscribers = new Set<string>((data ?? []) as string[]);
    const instant: string[] = [];
    const digestOnly: string[] = [];
    for (const uid of unique) {
      if (ownerSet.has(uid) || subscribers.has(uid)) instant.push(uid);
      else digestOnly.push(uid);
    }
    return { instant, digestOnly };
  } catch (err) {
    console.error('[participantFilter] fallback to instant-for-all:', err);
    return { instant: unique, digestOnly: [] };
  }
}
