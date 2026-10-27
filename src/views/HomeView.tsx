import React, { useState } from 'react';
import { useLiveLink } from '../context/LiveLinkContext';
import { Radio, Video, LayoutGrid, Activity, QrCode, Shield, Download, ArrowRight, Laptop, Camera, Wifi } from 'lucide-react';

interface HomeViewProps {
  onNavigate: (view: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { roomId, serverInfo, joinRoom } = useLiveLink();
  const [customRoom, setCustomRoom] = useState(roomId);

  const handleJoin = (targetView: string) => {
    if (customRoom.trim()) {
      onNavigate(targetView);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full p-4 md:p-8 text-zinc-100 space-y-12 my-auto">
      {/* Hero Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold tracking-wide uppercase">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>Self-Hosted LAN WebRTC Studio</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
          High-Bitrate, Zero-Lag Multi-Camera Live Production.
        </h1>

        <p className="text-zinc-400 text-sm md:text-base leading-relaxed">
          Engineered to replace VDO.Ninja on local Wi-Fi and Ethernet networks. 1080p60 up to 4K, locked frame rates, hardware NVENC encoding, and glass-to-glass latency under 100ms.
        </p>

        {/* Room Selector Input */}
        <div className="flex items-center justify-center gap-2 max-w-sm mx-auto pt-2">
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 flex items-center gap-2">
            <span className="text-zinc-500 text-xs font-mono font-bold">ROOM:</span>
            <input
              type="text"
              value={customRoom}
              onChange={(e) => setCustomRoom(e.target.value)}
              className="bg-transparent border-none text-white text-xs font-bold font-mono focus:outline-none w-full"
              placeholder="studio"
            />
          </div>
        </div>
      </div>

      {/* Primary Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Multiview Card */}
        <div
          onClick={() => handleJoin('receiver')}
          className="group relative p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-850/90 transition-all duration-200 cursor-pointer shadow-xl flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-red-600/20 text-red-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Director Multiview</span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Main production switcher with Program/Preview bus, live stats, multi-channel audio mixer, and ISO recording.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-2 text-xs font-semibold text-red-400">
            <span>Launch Studio Dashboard →</span>
          </div>
        </div>

        {/* Sender Card */}
        <div
          onClick={() => handleJoin('sender')}
          className="group relative p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850/90 transition-all duration-200 cursor-pointer shadow-xl flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Camera Sender</span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Open on camera laptops with capture cards or screen share. 1080p60 locked, 25-50 Mbps, wake lock & tally light.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-2 text-xs font-semibold text-blue-400">
            <span>Connect This Laptop →</span>
          </div>
        </div>

        {/* Diagnostics & Benchmark Card */}
        <div
          onClick={() => handleJoin('test')}
          className="group relative p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-850/90 transition-all duration-200 cursor-pointer shadow-xl flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Stress-Test & Benchmark</span>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Spawn 1 to 8+ synthetic 1080p60 senders with running frame counters, measure latency, and test LAN throughput.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center gap-2 text-xs font-semibold text-amber-400">
            <span>Run Benchmark Suite →</span>
          </div>
        </div>
      </div>

      {/* Network & QR Code Strip */}
      <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <Wifi className="w-4 h-4" />
            <span>LAN SERVER OPERATIONAL</span>
          </div>
          <div className="text-base font-bold text-white">
            Primary Studio Address: <span className="font-mono text-cyan-400">{serverInfo?.lanUrl || 'https://localhost:4443'}</span>
          </div>
          <p className="text-xs text-zinc-400">
            Camera laptops connected to the same Wi-Fi / LAN can directly open the Sender URL or scan the QR code.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/api/cert"
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-2 border border-zinc-700"
          >
            <Download className="w-3.5 h-3.5" />
            Download LAN Certificate
          </a>
        </div>
      </div>
    </div>
  );
};
