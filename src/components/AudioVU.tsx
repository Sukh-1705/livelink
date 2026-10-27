import React, { useEffect, useState } from 'react';
import clsx from 'clsx';

interface AudioVUProps {
  volume?: number;
  isMuted?: boolean;
  level?: number; // 0.0 to 1.0
  height?: string;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export const AudioVU: React.FC<AudioVUProps> = ({
  volume = 1.0,
  isMuted = false,
  level: externalLevel,
  height = 'h-24',
  orientation = 'vertical',
  className
}) => {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (externalLevel !== undefined) {
      setLevel(externalLevel);
      return;
    }

    if (isMuted) {
      setLevel(0);
      return;
    }

    // Dynamic animation simulation when active
    const interval = setInterval(() => {
      const randomJitter = Math.random() * 0.4 + 0.3;
      setLevel(Math.min(1.0, randomJitter * volume));
    }, 120);

    return () => clearInterval(interval);
  }, [externalLevel, isMuted, volume]);

  const percentage = isMuted ? 0 : Math.round(level * 100);

  if (orientation === 'horizontal') {
    return (
      <div className={clsx('relative w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800', className)}>
        <div
          className={clsx(
            'h-full transition-all duration-75',
            percentage > 85 ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500' :
            percentage > 60 ? 'bg-gradient-to-r from-emerald-500 to-amber-400' : 'bg-emerald-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }

  return (
    <div className={clsx('relative w-3 bg-zinc-900 rounded-md overflow-hidden border border-zinc-800 flex flex-col justify-end p-0.5', height, className)}>
      <div
        className={clsx(
          'w-full rounded-sm transition-all duration-75',
          percentage > 85 ? 'bg-red-500 shadow-sm shadow-red-500/50' :
          percentage > 65 ? 'bg-amber-400 shadow-sm shadow-amber-400/50' : 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
        )}
        style={{ height: `${percentage}%` }}
      />
    </div>
  );
};
