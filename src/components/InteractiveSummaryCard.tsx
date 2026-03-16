import React from 'react';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { cn } from '../types';

interface InteractiveSummaryCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export const InteractiveSummaryCard: React.FC<InteractiveSummaryCardProps> = ({
  label,
  value,
  hint,
  icon: Icon,
  iconClassName,
  active = false,
  onClick,
  className,
}) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</p>
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5 text-brand-cyan', iconClassName)} />
          {onClick ? <ArrowUpRight className="h-3.5 w-3.5 text-white/25" /> : null}
        </div>
      </div>
      {typeof value === 'string' || typeof value === 'number' ? (
        <p className="mt-4 break-words text-3xl font-bold">{value}</p>
      ) : (
        <div className="mt-4">{value}</div>
      )}
      {hint ? <p className="mt-2 text-sm text-white/45">{hint}</p> : null}
    </>
  );

  const sharedClassName = cn(
    'glass-panel h-full min-w-0 p-5 text-left transition-all',
    onClick && 'hover:bg-white/8 hover:border-brand-blue/20',
    active && 'border-brand-blue/30 bg-brand-blue/10 shadow-[0_0_20px_rgba(0,102,255,0.08)]',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={sharedClassName}>
        {content}
      </button>
    );
  }

  return <div className={sharedClassName}>{content}</div>;
};
