/**
 * AttachmentBar — kompaktan red od 3 chip-a: Projekt, Smjer, Krug.
 *
 * UI-only preustroj: mijenja SAMO način odabira pripadnosti u add/scan formama.
 * Underlying write-logika, guardovi i vidljivost su netaknuti — pojedini chip
 * se renderira samo kad ga roditelj eksplicitno omogući preko odgovarajućih
 * propova (npr. `projects` array, `showKrug`, itd.). Krug chip nikada se ne
 * prikazuje za `transfer` (roditelj šalje `showKrug=false`).
 *
 * Boje chipova prate module aplikacije: projekt = plava, smjer = ljubičasta,
 * krug = narančasta. Popup služi isključivo za izbor; brisanje odabira ostaje
 * na aktivnom chipu preko `×`.
 *
 * Interakcija: klik na chip otvara mali Popover s odabirom. Odabir se odmah
 * propagira roditelju, popover se zatvara (osim kod Krug-a gdje ostaje otvoren
 * za odabir privatnosti, jednako kao prije). Trenutni odabir vidljiv je iz
 * naljepnice chipa; klik na × briše odabir bez otvaranja popovera.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderKanban, PiggyBank, Users, User, Check, X, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMyKrugs } from '@/hooks/useKrug';

export type KrugPrivacy = 'personal' | 'shared';

interface Option {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  is_active?: boolean | null;
}

interface AttachmentBarProps {
  // Projekt
  showProject?: boolean;
  projects?: Option[];
  selectedProjectId?: string | null;
  onSelectedProjectIdChange?: (id: string | null) => void;

  // Smjer (underlying budget_id)
  showBudget?: boolean;
  budgets?: Option[];
  selectedBudgetId?: string | null;
  onSelectedBudgetIdChange?: (id: string | null) => void;

  // Krug
  showKrug?: boolean;
  krugId?: string | null;
  /**
   * Tri-state: `null` = korisnik još nije eksplicitno odabrao privacy.
   * Odabir Kruga NE postavlja default; korisnik mora kliknuti "Moje" ili "Za Krug".
   */
  krugPrivacy?: KrugPrivacy | null;
  onKrugChange?: (next: { krugId: string | null; privacy: KrugPrivacy | null }) => void;
  /** Legacy `krug_privacy='private'` — mapira se u UI kao personal, s hintom. */
  legacyPrivate?: boolean;


  /** Ako je true, project i smjer su međusobno isključivi (scan surface). */
  mutuallyExclusiveProjectBudget?: boolean;
}

type ChipTone = 'project' | 'budget' | 'krug';

const toneStyles: Record<
  ChipTone,
  {
    idle: string;
    active: string;
    icon: string;
    iconIdle: string;
    clearHover: string;
    selectedBg: string;
    selectedText: string;
  }
> = {
  project: {
    idle: 'bg-background/60 text-[hsl(217_91%_60%)] border-border border-dashed hover:bg-[hsl(217_91%_60%)]/10 hover:border-[hsl(217_91%_60%)]/30',
    active: 'bg-[hsl(217_91%_60%)]/10 text-[hsl(217_91%_60%)] border-[hsl(217_91%_60%)]/30',
    icon: 'text-[hsl(217_91%_60%)]',
    iconIdle: 'text-[hsl(217_91%_60%)]',
    clearHover: 'hover:bg-[hsl(217_91%_60%)]/20',
    selectedBg: 'bg-[hsl(217_91%_60%)]/5',
    selectedText: 'text-[hsl(217_91%_60%)]',
  },
  budget: {
    idle: 'bg-background/60 text-[hsl(258_90%_66%)] border-border border-dashed hover:bg-[hsl(258_90%_66%)]/10 hover:border-[hsl(258_90%_66%)]/30',
    active: 'bg-[hsl(258_90%_66%)]/10 text-[hsl(258_90%_66%)] border-[hsl(258_90%_66%)]/30',
    icon: 'text-[hsl(258_90%_66%)]',
    iconIdle: 'text-[hsl(258_90%_66%)]',
    clearHover: 'hover:bg-[hsl(258_90%_66%)]/20',
    selectedBg: 'bg-[hsl(258_90%_66%)]/5',
    selectedText: 'text-[hsl(258_90%_66%)]',
  },
  krug: {
    idle: 'bg-background/60 text-[hsl(25_95%_53%)] border-border border-dashed hover:bg-[hsl(25_95%_53%)]/10 hover:border-[hsl(25_95%_53%)]/30',
    active: 'bg-[hsl(25_95%_53%)]/10 text-[hsl(25_95%_53%)] border-[hsl(25_95%_53%)]/30',
    icon: 'text-[hsl(25_95%_53%)]',
    iconIdle: 'text-[hsl(25_95%_53%)]',
    clearHover: 'hover:bg-[hsl(25_95%_53%)]/20',
    selectedBg: 'bg-[hsl(25_95%_53%)]/5',
    selectedText: 'text-[hsl(25_95%_53%)]',
  },
};

interface ChipProps {
  tone: ChipTone;
  icon: React.ReactNode;
  emptyLabel: string;
  selectedLabel?: string | null;
  onClear?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  testId?: string;
}

const Chip = ({
  tone,
  icon,
  emptyLabel,
  selectedLabel,
  onClear,
  open,
  onOpenChange,
  children,
  testId,
}: ChipProps) => {
  const isSelected = !!selectedLabel;
  const styles = toneStyles[tone];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div className="flex-1 min-w-0">
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            className={cn(
              'w-full h-9 px-2.5 rounded-full border text-xs font-medium',
              'flex items-center gap-1.5 transition-all',
              isSelected ? styles.active : styles.idle
            )}
          >
            <span className={cn('shrink-0', isSelected ? styles.icon : styles.iconIdle)}>
              {icon}
            </span>
            <span className="truncate flex-1 text-left">
              {isSelected ? selectedLabel : emptyLabel}
            </span>
            {isSelected && onClear && (
              <span
                role="button"
                tabIndex={0}
                aria-label="clear"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onClear();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    onClear();
                  }
                }}
                className={cn('shrink-0 rounded-full p-0.5 transition-colors', styles.clearHover)}
              >
                <X className="w-3 h-3" />
              </span>
            )}
            {!isSelected && <Plus className="w-3 h-3 shrink-0 opacity-60" />}
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 p-0 rounded-2xl border border-border/60 bg-popover shadow-lg overflow-hidden z-50"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
};

interface PanelListProps {
  tone: ChipTone;
  title: string;
  options: Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fallbackIcon: string;
  onClose: () => void;
}

const PanelList = ({
  tone,
  title,
  options,
  selectedId,
  onSelect,
  fallbackIcon,
  onClose,
}: PanelListProps) => {
  const styles = toneStyles[tone];
  return (
    <div className="flex flex-col max-h-[320px]">
      <div className="px-3 py-2 border-b border-border/50">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-medium">
          {title}
        </div>
      </div>
      <div className="overflow-y-auto py-1">
        {options.map((opt) => {
          const isSelected = selectedId === opt.id;
          const color = opt.color || 'hsl(var(--primary))';
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onSelect(opt.id);
                onClose();
              }}
              className={cn(
                'w-full px-3 py-2 flex items-center gap-2.5 text-sm transition-colors',
                'hover:bg-muted/60',
                isSelected && cn(styles.selectedBg, styles.selectedText, 'font-medium')
              )}
            >
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-xs shrink-0"
                style={{ backgroundColor: color + '20', color }}
              >
                {opt.icon || fallbackIcon}
              </span>
              <span className="flex-1 text-left truncate">{opt.name}</span>
              {isSelected && <Check className={cn('w-4 h-4 shrink-0', styles.selectedText)} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const AttachmentBar = (props: AttachmentBarProps) => {
  const { t } = useTranslation();
  const [openChip, setOpenChip] = useState<ChipTone | null>(null);
  const { data: krugs = [] } = useMyKrugs();

  const projects = props.projects ?? [];
  const budgets = (props.budgets ?? []).filter((b) => b.is_active !== false);

  const showProject = props.showProject !== false && projects.length > 0;
  const showBudget = props.showBudget !== false && (props.budgets?.length ?? 0) > 0;
  const showKrug = !!props.showKrug && krugs.length > 0;

  if (!showProject && !showBudget && !showKrug) return null;

  const selectedProject = projects.find((p) => p.id === props.selectedProjectId) ?? null;
  const selectedBudget = budgets.find((b) => b.id === props.selectedBudgetId) ?? null;
  const selectedKrug = krugs.find((k) => k.id === props.krugId) ?? null;

  const close = () => setOpenChip(null);
  const krugStyles = toneStyles.krug;

  return (
    <div className="flex items-stretch gap-1.5">
      {showProject && (
        <Chip
          tone="project"
          testId="attachment-chip-project"
          icon={<FolderKanban className="w-3.5 h-3.5" />}
          emptyLabel={t('transactions.project', 'Projekt')}
          selectedLabel={selectedProject?.name}
          onClear={() => props.onSelectedProjectIdChange?.(null)}
          open={openChip === 'project'}
          onOpenChange={(o) => setOpenChip(o ? 'project' : null)}
        >
          <PanelList
            tone="project"
            title={t('transactions.assignToProject', 'Pridruži projektu')}
            options={projects}
            selectedId={props.selectedProjectId ?? null}
            onSelect={(id) => {
              props.onSelectedProjectIdChange?.(id);
              if (props.mutuallyExclusiveProjectBudget) {
                props.onSelectedBudgetIdChange?.(null);
              }
            }}
            fallbackIcon="📁"
            onClose={close}
          />
        </Chip>
      )}

      {showBudget && (
        <Chip
          tone="budget"
          testId="attachment-chip-budget"
          icon={<PiggyBank className="w-3.5 h-3.5" />}
          emptyLabel={t('transactions.attachment.smjer', 'Smjer')}
          selectedLabel={selectedBudget?.name}
          onClear={() => props.onSelectedBudgetIdChange?.(null)}
          open={openChip === 'budget'}
          onOpenChange={(o) => setOpenChip(o ? 'budget' : null)}
        >
          <PanelList
            tone="budget"
            title={t('transactions.attachment.assignToSmjer', 'Pridruži smjeru')}
            options={budgets}
            selectedId={props.selectedBudgetId ?? null}
            onSelect={(id) => {
              props.onSelectedBudgetIdChange?.(id);
              if (props.mutuallyExclusiveProjectBudget) {
                props.onSelectedProjectIdChange?.(null);
              }
            }}
            fallbackIcon="💰"
            onClose={close}
          />
        </Chip>
      )}

      {showKrug && (
        <Chip
          tone="krug"
          testId="attachment-chip-krug"
          icon={<Users className="w-3.5 h-3.5" />}
          emptyLabel={t('krug.selector.label', 'Krug')}
          selectedLabel={
            selectedKrug
              ? `${selectedKrug.name}${
                  props.krugPrivacy === 'shared'
                    ? ` · ${t('krug.selector.shared', 'Za Krug')}`
                    : ''
                }`
              : null
          }
          onClear={() => props.onKrugChange?.({ krugId: null, privacy: 'personal' })}
          open={openChip === 'krug'}
          onOpenChange={(o) => setOpenChip(o ? 'krug' : null)}
        >
          <div className="flex flex-col max-h-[380px]">
            <div className="px-3 py-2 border-b border-border/50">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-medium">
                {t('krug.selector.label', 'Krug')}
              </div>
            </div>
            <div className="overflow-y-auto py-1">
              {krugs.map((k) => {
                const isSelected = props.krugId === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => {
                      props.onKrugChange?.({
                        krugId: k.id,
                        privacy: props.krugPrivacy ?? 'personal',
                      });
                    }}
                    className={cn(
                      'w-full px-3 py-2 flex items-center gap-2.5 text-sm transition-colors hover:bg-muted/60',
                      isSelected && cn(krugStyles.selectedBg, krugStyles.selectedText, 'font-medium')
                    )}
                  >
                    <span
                      className={cn(
                        'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
                        isSelected ? 'bg-[hsl(25_95%_53%)]/10 text-[hsl(25_95%_53%)]' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Users className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 text-left truncate">{k.name}</span>
                    {isSelected && <Check className={cn('w-4 h-4 shrink-0', krugStyles.selectedText)} />}
                  </button>
                );
              })}
            </div>

            {props.krugId && (
              <div className="border-t border-border/50 p-2.5 space-y-2 bg-muted/20">
                <div className="flex gap-1 p-0.5 bg-background rounded-lg border border-border/50">
                  <button
                    type="button"
                    onClick={() =>
                      props.onKrugChange?.({ krugId: props.krugId!, privacy: 'personal' })
                    }
                    className={cn(
                      'flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1',
                      (props.krugPrivacy ?? 'personal') === 'personal'
                        ? 'bg-[hsl(25_95%_53%)] text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <User className="w-3 h-3" />
                    {t('krug.selector.personal', 'Moje')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      props.onKrugChange?.({ krugId: props.krugId!, privacy: 'shared' })
                    }
                    className={cn(
                      'flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1',
                      props.krugPrivacy === 'shared'
                        ? 'bg-[hsl(25_95%_53%)] text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Users className="w-3 h-3" />
                    {t('krug.selector.shared', 'Za Krug')}
                  </button>
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-snug">
                  {props.krugPrivacy === 'shared'
                    ? t(
                        'krug.selector.hintShared',
                        'Šalje se ostalim članovima Kruga na potvrdu. Krug bilježi zajednički trag potrošnje — ne obračunava dugove.'
                      )
                    : t(
                        'krug.selector.hintPersonal',
                        'Ostaje vidljivo samo tebi. Ne ide na potvrdu Krugu.'
                      )}
                </p>
                {props.legacyPrivate && props.krugPrivacy === 'personal' && (
                  <p className="text-[10.5px] text-amber-600 dark:text-amber-400 leading-snug">
                    {t(
                      'krug.selector.legacyPrivateHint',
                      'Ovaj je trošak izvorno bio označen kao „Skriveno od Kruga". U novoj verziji prikazuje se kao „Moje". Promjena izbora zamijenit će izvornu oznaku.'
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </Chip>
      )}
    </div>
  );
};
