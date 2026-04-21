import { ReactNode } from 'react';

interface Props {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  empty?: string;
  isEmpty?: boolean;
}

export const PulseMetricCard = ({ title, icon, children, empty, isEmpty }: Props) => {
  return (
    <div className="bg-card border rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        <span>{title}</span>
      </div>
      {isEmpty ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          {empty ?? '—'}
        </p>
      ) : (
        children
      )}
    </div>
  );
};
