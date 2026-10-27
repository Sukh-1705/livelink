import React, { useState } from 'react';
import { useLiveLink } from '../context/LiveLinkContext';
import { Radio, Video, LayoutGrid, Activity, QrCode, Wifi, Copy, Check, ExternalLink, Settings } from 'lucide-react';
import clsx from 'clsx';

interface NavigationProps {
  currentView?: string;
  onNavigate?: (view: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView = 'receiver', onNavigate }) => {
  const {
    isConnected,
    isReconnecting,
    roomId,
    mode,
    serverInfo,
    cameraStreams,
    wsSend
  } = useLiveLink();

  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Bandwidth calculation across all streams
  const totalBitrateKbps = cameraStreams.reduce((acc, s) => acc + (s.stats?.bitrateKbps || 25000), 0);
  const totalMbps = (totalBitrateKbps / 1000).toFixed(1);

  const senderUrl = serverInfo?.lanUrl ? `${serverInfo.lanUrl}/sender?room=${roomId}` : `${window.location.origin}/sender?room=${roomId}`;

  const copySenderLink = () => {
    navigator.clipboard.writeText(senderUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const toggleMode = () => {
    const nextMode = mode === 'sfu' ? 'p2p' : 'sfu';
    wsSend({ type: 'mode-override', mode: nextMode });
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between text-sm select-none">
        {/* Left: Branding & Connection Status */}
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => onNavigate && onNavigate('home')}
          >
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-red-600 shadow-lg shadow-red-900/40">
              <Radio className="w-4 h-4 text-white" />
              {isConnected && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950 animate-pulse" />
              )}
            </div>
            <div>
              <div className="font-extrabold tracking-tight text-white flex items-center gap-1.5">
                <span>LiveLink</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  LAN Studio
                </span>
              </div>
            </div>
          </div>

          {/* Room Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300">
            <span className="text-zinc-500">ROOM:</span>
            <span className="font-bold text-white">{roomId}</span>
          </div>

          {/* WebRTC Routing Badge */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-300"
          >
            <span className="text-zinc-500">ROUTING:</span>
            <span className="font-bold text-emerald-400">
              Direct WebRTC (P2P 60fps)
            </span>
          </div>
        </div>

        {/* Center: View Switcher Tabs */}
        <nav className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/80">
          <button
            onClick={() => onNavigate && onNavigate('receiver')}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
              currentView === 'receiver'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-red-500" />
            <span>Multiview</span>
            {cameraStreams.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-600/30 text-red-400 font-mono text-[10px]">
                {cameraStreams.length}
              </span>
            )}
          </button>

          <button
            onClick={() => onNavigate && onNavigate('sender')}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
              currentView === 'sender'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            )}
          >
            <Video className="w-3.5 h-3.5 text-blue-400" />
            <span>Sender</span>
          </button>

          <button
            onClick={() => onNavigate && onNavigate('test')}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
              currentView === 'test'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            )}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Benchmark</span>
          </button>
        </nav>

        {/* Right: Bandwidth Meter, QR Code & Actions */}
        <div className="flex items-center gap-2.5">
          {/* LAN Bandwidth Meter */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-400">{totalMbps} Mbps LAN</span>
          </div>

          {/* QR Code / Share Link Button */}
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors border border-zinc-700"
          >
            <QrCode className="w-3.5 h-3.5 text-zinc-300" />
            <span className="hidden sm:inline">Connect Cameras</span>
          </button>
        </div>
      </header>

      {/* Reconnecting Alert Banner */}
      {isReconnecting && (
        <div className="bg-amber-600/90 text-white text-xs font-medium py-1.5 px-4 text-center flex items-center justify-center gap-2 animate-pulse">
          <Wifi className="w-3.5 h-3.5" />
          <span>Network connection interrupted. Automatically reconnecting to LAN studio...</span>
        </div>
      )}

      {/* QR Code / Connect Camera Laptop Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Video className="w-5 h-5 text-red-500" />
              Connect Camera Laptops on LAN
            </h3>
            <p className="text-zinc-400 text-xs mb-4">
              Open this link on any laptop connected to your Wi-Fi or Ethernet LAN to stream DSLR or screen capture:
            </p>

            {serverInfo?.qrDataUri && (
              <div className="flex justify-center p-4 bg-white rounded-lg mb-4">
                <img src={serverInfo.qrDataUri} alt="Camera QR Code" className="w-48 h-48" />
              </div>
            )}

            <div className="flex items-center gap-2 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 mb-4">
              <span className="font-mono text-xs text-zinc-300 truncate flex-1">{senderUrl}</span>
              <button
                onClick={copySenderLink}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium flex items-center gap-1 shrink-0"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/60 text-[11px] text-zinc-400 space-y-1 mb-5">
              <div className="font-semibold text-zinc-300">💡 Browser Security Notice:</div>
              <div>Because LiveLink runs on your local LAN with a self-signed TLS cert, Chrome/Edge will show a certificate notice. Click <strong>Advanced → Proceed to {serverInfo?.primaryIp || 'LAN'}</strong> once.</div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
