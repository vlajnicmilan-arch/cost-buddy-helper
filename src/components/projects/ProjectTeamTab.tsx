import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, ClipboardList, Handshake, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProjectMembersTab } from './ProjectMembersTab';
import { ProjectWorkersTab } from './ProjectWorkersTab';
import { ProjectCollaboratorsTab } from './ProjectCollaboratorsTab';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { useProjectCollaborators } from '@/hooks/useProjectCollaborators';

type SubTab = 'members' | 'workers' | 'collaborators';

interface ProjectTeamTabProps {
  projectId: string;
  projectName: string;
  members: any[];
  invitations: any[];
  isManager: boolean;
  membersLoading: boolean;
  onRefetchMembers: () => void;
  milestones: any[];
  canSeeWorkers: boolean;
  canSeeCollaborators: boolean;
  initialSubTab?: SubTab;
}

export const ProjectTeamTab = ({
  projectId,
  projectName,
  members,
  invitations,
  isManager,
  membersLoading,
  onRefetchMembers,
  milestones,
  canSeeWorkers,
  canSeeCollaborators,
  initialSubTab,
}: ProjectTeamTabProps) => {
  const { t } = useTranslation();
  const { workers } = useProjectWorkers(projectId);
  const { collaborators } = useProjectCollaborators(projectId);

  const tabs = useMemo(() => {
    const list: { id: SubTab; label: string; icon: typeof Users; count: number; tooltip: string }[] = [
      {
        id: 'members',
        label: t('projects.team', 'Tim'),
        icon: Users,
        count: members?.length || 0,
        tooltip: t('projects.tooltips.team', 'Drugi korisnici aplikacije s pristupom projektu'),
      },
    ];
    if (canSeeWorkers) {
      list.push({
        id: 'workers',
        label: t('projects.workers', 'Radnici'),
        icon: ClipboardList,
        count: workers?.length || 0,
        tooltip: t('projects.tooltips.workers', 'Tvoji zaposlenici (vodiš ih ti, plaćaš ih, evidencija sati)'),
      });
    }
    if (canSeeCollaborators) {
      list.push({
        id: 'collaborators',
        label: t('projects.collaborators', 'Suradnici'),
        icon: Handshake,
        count: collaborators?.length || 0,
        tooltip: t('projects.tooltips.collaborators', 'Vanjski podizvođači (drugi obrti/tvrtke s ugovorenim iznosom)'),
      });
    }
    return list;
  }, [t, members, workers, collaborators, canSeeWorkers, canSeeCollaborators]);

  const [active, setActive] = useState<SubTab>(() => {
    if (initialSubTab && tabs.some((tb) => tb.id === initialSubTab)) return initialSubTab;
    return 'members';
  });

  return (
    <div className="space-y-4">
      {/* Internal segmented sub-tabs */}
      <TooltipProvider delayDuration={200}>
        <div className="flex gap-1 p-1 bg-muted/40 rounded-xl border border-border/30 overflow-x-auto scrollbar-hide">
          {tabs.map(({ id, label, icon: Icon, count, tooltip }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-all min-h-[44px] flex-1 justify-center',
                active === id
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:bg-muted/60'
              )}
              aria-pressed={active === id}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              <Badge variant="secondary" className="h-4 px-1 text-[10px] leading-none">
                {count}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-0.5 inline-flex" onClick={(e) => e.stopPropagation()}>
                    <HelpCircle className="w-3 h-3 opacity-60" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </button>
          ))}
        </div>
      </TooltipProvider>

      {/* Active sub-tab content */}
      {active === 'members' && (
        <ProjectMembersTab
          projectId={projectId}
          members={members}
          invitations={invitations}
          isManager={isManager}
          loading={membersLoading}
          onRefetch={onRefetchMembers}
        />
      )}
      {active === 'workers' && canSeeWorkers && (
        <ProjectWorkersTab
          projectId={projectId}
          projectName={projectName}
          isManager={isManager}
          onRefetch={() => {}}
        />
      )}
      {active === 'collaborators' && canSeeCollaborators && (
        <ProjectCollaboratorsTab
          projectId={projectId}
          milestones={milestones}
          isManager={isManager}
        />
      )}
    </div>
  );
};
