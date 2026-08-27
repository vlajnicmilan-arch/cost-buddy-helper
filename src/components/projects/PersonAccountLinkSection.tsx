/**
 * "Povezan s Centar računom" — account link on the PERSON card (Ljudi).
 *
 * The link belongs to the person: linking one engagement (e.g. through an
 * invitation) propagates to all her engagements. It grants NO access to the
 * app — access still comes exclusively from project members.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link2, Link2Off, Mail, Copy, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { usePersonLink } from '@/hooks/usePersonLink';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import { pickInviteCarrier, skippedProjectNames, type EngagementLink } from '@/lib/personLinkPlan';
import {
  buildMemberChoices,
  memberChoiceContext,
  memberChoiceLabel,
  ownInvitationEmails,
  type InvitationRow,
  type MemberChoice,
} from '@/lib/memberChoice';

interface Props {
  personId: string;
  linkedUserId: string | null;
  projectNames: Record<string, string>;
  onChanged?: () => void;
}

export const PersonAccountLinkSection = ({ personId, linkedUserId, projectNames, onChanged }: Props) => {
  const { t } = useTranslation();
  const { linkPerson, unlinkPerson, pending } = usePersonLink();

  const [engagements, setEngagements] = useState<EngagementLink[]>([]);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberChoice[]>([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const loadEngagements = useCallback(async () => {
    const { data } = await supabase
      .from('project_workers')
      .select('id, project_id, user_id, created_at')
      .eq('worker_id', personId);
    setEngagements(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        projectId: r.project_id ?? null,
        userId: r.user_id ?? null,
        createdAt: r.created_at ?? null,
      })),
    );
  }, [personId]);

  useEffect(() => {
    void loadEngagements();
  }, [loadEngagements]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!linkedUserId) {
        setLinkedName(null);
        return;
      }
      const { data } = await (supabase.rpc as any)('get_public_profiles', { _user_ids: [linkedUserId] });
      if (!cancelled) setLinkedName(((data ?? [])[0] as any)?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedUserId]);

  const projectIds = useMemo(
    () => Array.from(new Set(engagements.map((e) => e.projectId).filter(Boolean) as string[])),
    [engagements],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (linkedUserId || projectIds.length === 0) {
        setMembers([]);
        return;
      }
      const [{ data: auth }, memberResults, invitesRes, workersRes] = await Promise.all([
        supabase.auth.getUser(),
        Promise.all(
          projectIds.map(async (id) => ({
            id,
            rows: ((await (supabase.rpc as any)('get_project_member_profiles', { _project_id: id })) as any)
              ?.data as any[] | null,
          })),
        ),
        supabase
          .from('project_invitations')
          .select('invited_user_id, invited_by, email, created_at')
          .in('project_id', projectIds),
        supabase.from('workers').select('id, first_name, last_name, linked_user_id').not('linked_user_id', 'is', null),
      ]);

      const ownerId = auth?.user?.id ?? '';
      const byUser = new Map<string, { name: string | null; projectIds: string[] }>();
      for (const res of memberResults) {
        for (const row of (res.rows ?? []) as any[]) {
          if (!row?.user_id) continue;
          const entry = byUser.get(row.user_id) ?? { name: null, projectIds: [] };
          entry.name = entry.name || (row.display_name ?? null);
          entry.projectIds.push(res.id);
          byUser.set(row.user_id, entry);
        }
      }

      const emails = ownInvitationEmails((invitesRes.data ?? []) as InvitationRow[], ownerId);
      const linkedPersons = new Map<string, { id: string; name: string }>();
      for (const w of ((workersRes.data ?? []) as any[])) {
        if (w?.linked_user_id) {
          linkedPersons.set(w.linked_user_id, {
            id: w.id,
            name: `${w.first_name ?? ''} ${w.last_name ?? ''}`.trim(),
          });
        }
      }

      const choices = buildMemberChoices(
        Array.from(byUser, ([userId, v]) => ({
          userId,
          displayName: v.name,
          projectIds: v.projectIds,
          invitedEmail: emails.get(userId)?.email ?? null,
          invitedAt: emails.get(userId)?.invitedAt ?? null,
          linkedPersonId: linkedPersons.get(userId)?.id ?? null,
          linkedPersonName: linkedPersons.get(userId)?.name ?? null,
        })),
        projectNames,
        personId,
      );
      if (!cancelled) setMembers(choices);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectIds, linkedUserId, projectNames, personId]);

  const carrier = useMemo(() => pickInviteCarrier(engagements), [engagements]);
  const { generateInviteLink, sendInviteEmail } = useProjectMembers(carrier?.projectId ?? null);

  const reportSkipped = (skipped: string[]) => {
    if (skipped.length === 0) return;
    const names = skippedProjectNames(skipped, projectNames, t('people.unknownProject', 'Projekt'));
    showError(
      t(
        'people.link.skipped',
        'Preskočeno: {{projects}} — na tom projektu je taj račun već vezan uz drugog radnika.',
        { projects: names.join(', ') },
      ),
    );
  };

  const handleLink = async () => {
    if (!selectedMember) return;
    const res = await linkPerson(personId, selectedMember);
    if (!res.ok) {
      const notMember = (res.dbMessage ?? '').includes('person_link_user_not_member');
      showError(
        notMember
          ? t(
              'people.link.notMember',
              'Taj račun nije član nijednog projekta te osobe. Prvo ga dodaj u Članove projekta.',
            )
          : t('people.link.failed', 'Povezivanje nije uspjelo: {{reason}}', {
              reason: res.dbMessage ?? t('common.error'),
            }),
      );
      return;
    }
    showSuccess(
      t('people.link.done', 'Povezano — {{count}} angažmana', { count: res.engagementsLinked }),
    );
    reportSkipped(res.skippedProjects);
    setSelectedMember('');
    await loadEngagements();
    onChanged?.();
  };

  const handleUnlink = async () => {
    const res = await unlinkPerson(personId);
    setConfirmUnlink(false);
    if (!res.ok) {
      showError(
        t('people.link.unlinkFailed', 'Odvezivanje nije uspjelo: {{reason}}', {
          reason: res.dbMessage ?? t('common.error'),
        }),
      );
      return;
    }
    showSuccess(t('people.link.unlinked', 'Veza s Centar računom je uklonjena'));
    await loadEngagements();
    onChanged?.();
  };

  const handleGenerateInvite = async () => {
    if (!carrier) return;
    setInviting(true);
    try {
      const link = await generateInviteLink('member', 'personal', undefined, carrier.id);
      if (link) setInviteLink(link);
      else showError(t('people.link.inviteFailed', 'Pozivnica nije stvorena'));
    } finally {
      setInviting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!carrier || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await sendInviteEmail(inviteEmail.trim(), 'member', carrier.id, 'personal');
      if (res.success) {
        showSuccess(t('people.link.inviteSent', 'Pozivnica poslana'));
        setInviteEmail('');
      } else {
        showError(t('people.link.inviteFailed', 'Pozivnica nije stvorena'));
      }
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            {linkedUserId ? <Link2 className="w-4 h-4 text-primary" /> : <Link2Off className="w-4 h-4 text-muted-foreground" />}
            {linkedUserId
              ? t('people.link.linked', 'Povezan s Centar računom')
              : t('people.link.notLinked', 'Nije povezan')}
          </p>
          {linkedUserId && (
            <p className="text-xs text-muted-foreground truncate">{linkedName || linkedUserId}</p>
          )}
        </div>
        {linkedUserId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-destructive shrink-0"
            disabled={pending}
            onClick={() => setConfirmUnlink(true)}
          >
            {t('people.link.unlink', 'Odveži')}
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {t(
          'people.link.boundary',
          'Veza ne daje pristup aplikaciji. Pristup dolazi iz Članova projekta. Radnik vidi samo svoje sate, poziciju i zaradu.',
        )}
      </p>

      {!linkedUserId && (
        <div className="space-y-3">
          {members.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">
                {t('people.link.existingMember', 'Poveži s postojećim članom')}
              </p>
              <div className="flex gap-2">
                <Select value={selectedMember} onValueChange={setSelectedMember}>
                  <SelectTrigger className="flex-1 min-h-[44px]">
                    <SelectValue placeholder={t('people.link.choose', 'Odaberi člana')} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => {
                      const context = memberChoiceContext(m);
                      return (
                        <SelectItem key={m.userId} value={m.userId} disabled={m.disabled}>
                          <span className="flex flex-col text-left">
                            <span>
                              {memberChoiceLabel(m, {
                                noName: t('people.link.noName', 'Bez imena'),
                                noNameInvited: (date) =>
                                  t('people.link.noNameInvited', 'Bez imena · pozvan {{date}}', { date }),
                                formatDate: (iso) => new Date(iso).toLocaleDateString(),
                              })}
                            </span>
                            {context && <span className="text-[11px] text-muted-foreground">{context}</span>}
                            {m.disabled && (
                              <span className="text-[11px] text-destructive">
                                {t('people.link.alreadyLinkedTo', 'već povezan: {{person}} — prvo odveži', {
                                  person: m.blockedByPersonName || t('people.link.otherPerson', 'druga osoba'),
                                })}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button className="min-h-[44px]" disabled={!selectedMember || pending} onClick={handleLink}>
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('people.link.linkBtn', 'Poveži')}
                </Button>
              </div>
            </div>
          )}

          {carrier && (
            <div className="space-y-2">
              <p className="text-xs font-medium">{t('people.link.invite', 'Pozovi u Centar')}</p>
              {inviteLink ? (
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="text-xs" />
                  <Button
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteLink);
                      showSuccess(t('projects.linkCopied', 'Link kopiran'));
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full min-h-[44px]"
                  disabled={inviting}
                  onClick={handleGenerateInvite}
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('people.link.generate', 'Generiraj pozivni link')}
                </Button>
              )}
              <div className="flex gap-2">
                <Input
                  type="email"
                  inputMode="email"
                  placeholder={t('people.link.emailPlaceholder', 'E-mail radnika')}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={inviting || !inviteEmail.trim()}
                  onClick={handleSendEmail}
                >
                  <Mail className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmActionDialog
        open={confirmUnlink}
        onOpenChange={setConfirmUnlink}
        title={t('people.link.unlinkTitle', 'Odveži Centar račun')}
        description={t(
          'people.link.unlinkDesc',
          'Veza se uklanja s osobe i sa svih njezinih angažmana. Sati i isplate ostaju nepromijenjeni.',
        )}
        confirmLabel={t('people.link.unlink', 'Odveži')}
        destructive
        pending={pending}
        onConfirm={handleUnlink}
      />
    </div>
  );
};
