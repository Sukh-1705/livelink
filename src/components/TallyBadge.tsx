import React from 'react';
import { TallyState } from '../types';
import clsx from 'clsx';

interface TallyBadgeProps {
  state: TallyState;
  showText?: boolean;
  className?: string;
}

export const TallyBadge: React.FC<TallyBadgeProps> = ({ state, showText = true, className }) => {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase transition-all duration-300 border shadow-sm',
        state === 'program' && 'bg-red-500/20 text-red-400 border-red-500/40 shadow-red-950/50',
        state === 'preview' && 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-950/50',
        state === 'standby' && 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
        className
      )}
    >
      <span
        className={clsx(
          'w-2 h-2 rounded-full transition-all duration-300',
          state === 'program' && 'bg-red-500 animate-pulse',
          state === 'preview' && 'bg-emerald-400',
          state === 'standby' && 'bg-zinc-500'
        )}
      />
      {showText && (
        <span>
          {state === 'program' ? 'ON AIR' : state === 'preview' ? 'PREVIEW' : 'STANDBY'}
        </span>
      )}
    </div>
  );
};
