import React from 'react';
import { cn } from '../types';

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className, iconClassName }) => (
  <div
    className={cn(
      'bg-brand-blue rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,102,255,0.35)]',
      className,
    )}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn('w-9 h-9', iconClassName)}
    >
      <circle cx="32" cy="32" r="24" stroke="white" strokeWidth="4" />
      <circle cx="23.5" cy="25.5" r="4" fill="white" />
      <circle cx="40.5" cy="25.5" r="4" fill="white" />
      <path
        d="M20 38C24.5 44 28.5 47 32 47C35.5 47 39.5 44 44 38"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);
