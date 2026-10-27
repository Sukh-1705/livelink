import React from 'react';
import { CueMessage } from '../types';
import { MessageSquare } from 'lucide-react';

interface CueOverlayProps {
  cues: CueMessage[];
}

export const CueOverlay: React.FC<CueOverlayProps> = ({ cues }) => {
  if (cues.length === 0) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-lg w-full px-4 pointer-events-none">
      {cues.map((cue) => (
        <div
          key={cue.id}
          className="bg-amber-500/95 text-black font-bold text-sm md:text-base px-4 py-3 rounded-xl shadow-2xl border-2 border-white flex items-center gap-3 animate-bounce"
        >
          <div className="p-1.5 bg-black/10 rounded-lg shrink-0">
            <MessageSquare className="w-5 h-5 text-black" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-black/70 font-black">
              DIRECTOR CUE
            </div>
            <div>{cue.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
