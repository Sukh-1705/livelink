import React, { useState } from 'react';
import { CameraStream, ServerInfo } from '../types';
import { Globe, Copy, Check, ExternalLink, X, Video, Monitor, Radio, Tv, Info } from 'lucide-react';
import clsx from 'clsx';

interface BroadcastLinksModalProps {
  cameraStreams: CameraStream[];
  serverInfo: ServerInfo | null;
  roomId: string;
  onClose: () => void;
}

export const BroadcastLinksModal: React.FC<BroadcastLinksModalProps> = ({
  cameraStreams,
  serverInfo,
  roomId,
  onClose
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Determine base host (prioritize public Cloudflare URL if available, else current origin)
  const baseUrl = serverInfo?.publicUrl || window.location.origin;
  const isWorldwide = Boolean(serverInfo?.publicUrl);

  const copyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const multiviewUrl = `${baseUrl}/multiview/${roomId}`;
  const senderUrl = `${baseUrl}/sender?room=${roomId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-red-600/20 text-red-400 flex items-center justify-center">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Broadcast Links & Stream Feeds
            </h2>
            <p className="text-xs text-zinc-400">
              Direct URLs to access individual camera feeds on any computer, OBS Studio, or browser.
            </p>
          </div>
        </div>

        {/* Worldwide Hosting Status Banner */}
        <div className="mt-4 mb-6 p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className={clsx(
              'w-2.5 h-2.5 rounded-full',
              isWorldwide ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
            )} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                {isWorldwide ? 'PUBLIC CLOUDFLARE EDGE HOST' : 'LOCAL LAN HOST'}
              </div>
              <div className="font-mono text-xs font-bold text-white truncate max-w-md">
                {baseUrl}
              </div>
            </div>
          </div>
          <span className={clsx(
            'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
            isWorldwide
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
          )}>
            {isWorldwide ? 'Accessible Worldwide' : 'LAN Active'}
          </span>
        </div>

        {/* Stream List */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {cameraStreams.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs font-mono">
              No camera feeds currently connected. Connect a sender laptop or start simulation.
            </div>
          ) : (
            cameraStreams.map((stream, idx) => {
              const cleanViewUrl = `${baseUrl}/view/${roomId}/${stream.id}`;
              const isCopied = copiedId === stream.id;

              return (
                <div
                  key={stream.id}
                  className="p-4 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 hover:border-zinc-700 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-zinc-800 text-white font-mono text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-sm text-white">{stream.label}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                        ID: {stream.id.substring(0, 8)}
                      </span>
                    </div>

                    <a
                      href={cleanViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                    >
                      <span>Open Feed</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Clean OBS Link Box */}
                  <div className="flex items-center gap-2 bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                    <Monitor className="w-4 h-4 text-zinc-500 shrink-0 ml-1" />
                    <span className="font-mono text-xs text-zinc-300 truncate flex-1 select-all">
                      {cleanViewUrl}
                    </span>
                    <button
                      onClick={() => copyLink(cleanViewUrl, stream.id)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all',
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                      )}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Copied' : 'Copy Link'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Additional Production Links (Clean Multiview & Camera Connect) */}
        <div className="mt-6 pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-red-500" />
                OBS Clean Multiview
              </div>
              <div className="text-[11px] text-zinc-400">All cameras grid feed</div>
            </div>
            <button
              onClick={() => copyLink(multiviewUrl, 'multiview')}
              className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white font-medium flex items-center gap-1"
            >
              {copiedId === 'multiview' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedId === 'multiview' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-blue-400" />
                Camera Sender Link
              </div>
              <div className="text-[11px] text-zinc-400">For camera laptops/phones</div>
            </div>
            <button
              onClick={() => copyLink(senderUrl, 'sender')}
              className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white font-medium flex items-center gap-1"
            >
              {copiedId === 'sender' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedId === 'sender' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* OBS Setup Instructions Tip */}
        <div className="mt-4 p-3 bg-blue-950/30 rounded-xl border border-blue-800/40 text-[11px] text-blue-300 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <strong>How to add to OBS Studio / vMix:</strong> Add a new <em>Browser Source</em> in OBS, paste the copied link, set Width to <code>1920</code>, Height to <code>1080</code>, check <em>"Control audio via OBS"</em>, and check <em>"Shutdown source when not visible"</em>.
          </div>
        </div>

        {/* Modal Done Button */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
