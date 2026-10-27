import React, { useState } from 'react';
import { CameraStream } from '../types';
import { Sliders, RefreshCw, VolumeX, Volume2, ShieldAlert, X } from 'lucide-react';

interface RemoteControlModalProps {
  stream: CameraStream;
  onClose: () => void;
  onSendCommand: (command: string, payload: any) => void;
}

export const RemoteControlModal: React.FC<RemoteControlModalProps> = ({
  stream,
  onClose,
  onSendCommand
}) => {
  const [bitrate, setBitrate] = useState(stream.settings?.bitrateKbps || 25000);
  const [fps, setFps] = useState(stream.settings?.frameRate || 60);

  const applyBitrate = () => {
    onSendCommand('set-bitrate', bitrate);
  };

  const applyFps = (newFps: number) => {
    setFps(newFps);
    onSendCommand('set-fps', newFps);
  };

  const requestKeyframe = () => {
    onSendCommand('request-keyframe', true);
  };

  const restartStream = () => {
    onSendCommand('restart-stream', true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          Remote Control: {stream.label}
        </h3>
        <p className="text-zinc-400 text-xs mb-5">
          Live parameter dispatch to camera laptop without restarting the feed.
        </p>

        {/* Bitrate Control */}
        <div className="mb-5 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-300 font-medium">Target Bitrate:</span>
            <span className="font-mono text-cyan-400 font-bold">{(bitrate / 1000).toFixed(1)} Mbps</span>
          </div>
          <input
            type="range"
            min="5000"
            max="80000"
            step="1000"
            value={bitrate}
            onChange={(e) => setBitrate(Number(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>5 Mbps (720p)</span>
            <span>25 Mbps (1080p60)</span>
            <span>80 Mbps (4K Max)</span>
          </div>
          <button
            onClick={applyBitrate}
            className="w-full mt-1.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
          >
            Push Bitrate Update
          </button>
        </div>

        {/* Frame Rate Presets */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-zinc-300 mb-2">Target Frame Rate:</label>
          <div className="grid grid-cols-4 gap-2">
            {[24, 30, 50, 60].map((rate) => (
              <button
                key={rate}
                onClick={() => applyFps(rate)}
                className={`py-1.5 rounded-lg text-xs font-semibold border ${
                  fps === rate
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-750'
                }`}
              >
                {rate} fps
              </button>
            ))}
          </div>
        </div>

        {/* Stream Actions */}
        <div className="border-t border-zinc-800 pt-4 space-y-2">
          <button
            onClick={requestKeyframe}
            className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700"
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            Request Instant Keyframe (Fix Stutter)
          </button>

          <button
            onClick={restartStream}
            className="w-full py-2 rounded-lg bg-red-950/40 hover:bg-red-900/40 text-red-300 text-xs font-semibold flex items-center justify-center gap-2 border border-red-800/50"
          >
            <ShieldAlert className="w-4 h-4 text-red-400" />
            Force Re-initialize Camera Capture
          </button>
        </div>
      </div>
    </div>
  );
};
