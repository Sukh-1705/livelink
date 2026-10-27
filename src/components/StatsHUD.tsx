import React, { useState } from 'react';
import { StreamStats } from '../types';
import { Activity, Cpu, Wifi, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

interface StatsHUDProps {
  stats?: StreamStats;
  className?: string;
  defaultExpanded?: boolean;
}

export const StatsHUD: React.FC<StatsHUDProps> = ({
  stats,
  className,
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!stats) return null;

  const bitrateMbps = (stats.bitrateKbps / 1000).toFixed(1);
  const isHealthy = stats.health === 'green';
  const isWarning = stats.health === 'yellow';

  return (
    <div
      className={clsx(
        'bg-zinc-950/85 backdrop-blur-md rounded-lg border text-xs font-mono transition-all duration-200 select-none shadow-xl',
        isHealthy ? 'border-zinc-800/80 text-zinc-300' :
        isWarning ? 'border-amber-500/50 text-amber-200' : 'border-red-500/60 text-red-200',
        className
      )}
    >
      {/* Top Bar: Always visible */}
      <div
        className="flex items-center justify-between gap-3 px-2.5 py-1.5 cursor-pointer hover:bg-white/5 rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              isHealthy ? 'bg-emerald-400' : isWarning ? 'bg-amber-400' : 'bg-red-500 animate-pulse'
            )}
          />
          <span className="font-bold text-white tracking-wide">
            {stats.width}x{stats.height} @ {stats.fps}fps
          </span>
          <span className="text-zinc-400">|</span>
          <span className="text-emerald-400 font-semibold">{bitrateMbps} Mbps</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400 flex items-center gap-1">
            <Wifi className="w-3 h-3 text-cyan-400" />
            {stats.rttMs}ms
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
        </div>
      </div>

      {/* Expanded Telemetry Details */}
      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-zinc-800/60 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-400">
          <div className="flex items-center justify-between">
            <span>Latency / RTT:</span>
            <span className="text-zinc-200 font-medium">{stats.rttMs} ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Packet Loss:</span>
            <span className={clsx(stats.packetLossPercent > 0 ? 'text-amber-400' : 'text-zinc-200 font-medium')}>
              {stats.packetLossPercent}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Jitter:</span>
            <span className="text-zinc-200 font-medium">{stats.jitterMs} ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Dropped Frames:</span>
            <span className={clsx(stats.droppedFrames > 0 ? 'text-amber-400' : 'text-zinc-200 font-medium')}>
              {stats.droppedFrames}
            </span>
          </div>
          {stats.encoder && (
            <div className="col-span-2 flex items-center gap-1.5 pt-1 text-zinc-300">
              <Cpu className="w-3 h-3 text-purple-400 shrink-0" />
              <span className="truncate">Encoder: {stats.encoder} (HW)</span>
            </div>
          )}
          {stats.decoder && (
            <div className="col-span-2 flex items-center gap-1.5 text-zinc-300">
              <Activity className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">Decoder: {stats.decoder}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
