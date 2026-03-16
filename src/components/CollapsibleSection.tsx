import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../types';

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  className?: string;
  bodyClassName?: string;
}

const readStoredState = (storageKey: string, fallback: boolean) => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(storageKey);

  if (storedValue === 'true') {
    return true;
  }

  if (storedValue === 'false') {
    return false;
  }

  return fallback;
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  description,
  icon,
  summary,
  actions,
  children,
  defaultOpen = true,
  storageKey,
  className,
  bodyClassName,
}) => {
  const [open, setOpen] = useState(() =>
    storageKey ? readStoredState(storageKey, defaultOpen) : defaultOpen,
  );

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, String(open));
  }, [open, storageKey]);

  return (
    <section className={cn('glass-panel', className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        aria-expanded={open}
        className={cn(
          'w-full px-6 py-5 text-left transition-colors',
          open ? 'border-b border-white/10 bg-white/[0.02]' : 'hover:bg-white/[0.02]',
        )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {icon ? (
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-brand-cyan">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-bold">{title}</h3>
                {summary ? (
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
                    {summary}
                  </div>
                ) : null}
              </div>
              {description ? <p className="mt-1 text-sm text-white/45">{description}</p> : null}
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-3 xl:justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="glass-button-secondary shrink-0"
              aria-label={open ? `Ocultar ${title}` : `Mostrar ${title}`}
            >
              {open ? 'Ocultar' : 'Mostrar'}
              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={open ? 'overflow-visible' : 'overflow-hidden'}
          >
            <div className={cn('space-y-6 p-6', bodyClassName)}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
};
