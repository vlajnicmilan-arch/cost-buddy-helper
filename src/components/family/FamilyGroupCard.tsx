import { FamilyGroup } from '@/types/family';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface FamilyGroupCardProps {
  group: FamilyGroup;
  onClick: () => void;
}

export const FamilyGroupCard = ({ group, onClick }: FamilyGroupCardProps) => {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border/50 hover:border-border transition-colors text-left"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
        style={{ backgroundColor: `${group.color}20` }}
      >
        {group.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground truncate">{group.name}</h3>
        <p className="text-xs text-muted-foreground">
          Klikni za detalje
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </motion.button>
  );
};
