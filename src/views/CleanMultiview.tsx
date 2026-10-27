import React, { useEffect } from 'react';
import { useLiveLink } from '../context/LiveLinkContext';
import { TallyBadge } from '../components/TallyBadge';
import clsx from 'clsx';

export const CleanMultiview: React.FC = () => {
  const { cameraStreams, programStreamId, previewStreamId, joinRoom, roomId } = useLiveLink();

  useEffect(() => {
    const parts = window.location.pathname.split('/');
    if (parts.length >= 3 && parts[1] === 'multiview') {
      const urlRoom = parts[2];
      joinRoom(urlRoom, 'viewer', 'OBS Multiview');
    }
  }, [joinRoom]);

  const count = cameraStreams.length;
  const gridClass =
    count <= 1 ? 'grid-cols-1' :
    count === 2 ? 'grid-cols-2' :
    count <= 4 ? 'grid-cols-2' :
    count <= 6 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black p-2 flex flex-col justify-center">
      {count === 0 ? (
        <div className="text-zinc-600 font-mono text-xs text-center">
          Awaiting LiveLink camera streams...
        </div>
      ) : (
        <div className={clsx('grid gap-2 h-full w-full', gridClass)}>
          {cameraStreams.map((s, idx) => {
            const isProgram = programStreamId === s.id;
            const isPreview = previewStreamId === s.id;

            return (
              <div
                key={s.id}
                className={clsx(
                  'relative rounded-xl overflow-hidden bg-zinc-950 border-2 flex items-center justify-center',
                  isProgram ? 'border-red-500' : isPreview ? 'border-emerald-500' : 'border-zinc-850'
                )}
              >
                <video
                  ref={(el) => {
                    if (el && el.srcObject !== s.mediaStream) {
                      el.srcObject = s.mediaStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-black/80 text-[10px] font-mono font-bold text-white flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/80 text-[11px] font-bold text-white">
                    {s.label}
                  </span>
                  <TallyBadge state={isProgram ? 'program' : isPreview ? 'preview' : 'standby'} showText={false} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
