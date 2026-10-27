import React, { useState, useEffect, useRef } from 'react';
import { useLiveLink } from '../context/LiveLinkContext';
import { CameraStream } from '../types';
import {
  LayoutGrid, Radio, Sliders, Volume2, VolumeX, Maximize2, ExternalLink,
  MessageSquare, Circle, Play, Square, Scissors, Copy, Check, ShieldAlert, Globe
} from 'lucide-react';
import { StatsHUD } from '../components/StatsHUD';
import { TallyBadge } from '../components/TallyBadge';
import { AudioVU } from '../components/AudioVU';
import { RemoteControlModal } from '../components/RemoteControlModal';
import { BroadcastLinksModal } from '../components/BroadcastLinksModal';
import { IsoRecorderManager, StreamRecorder } from '../utils/recorder';
import clsx from 'clsx';

const StreamVideoPlayer: React.FC<{ mediaStream: MediaStream; className?: string }> = ({ mediaStream, className }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaStream) return;

    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
    }

    const tryPlay = () => {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    };

    tryPlay();

    const tracks = mediaStream.getTracks();
    tracks.forEach(track => {
      track.onunmute = () => {
        console.log(`[StreamVideoPlayer] Track ${track.kind} unmuted, playing`);
        tryPlay();
      };
    });
  }, [mediaStream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className || "w-full h-full object-cover"}
    />
  );
};

export const ReceiverView: React.FC = () => {
  const {
    roomId,
    serverInfo,
    cameraStreams,
    programStreamId,
    previewStreamId,
    setProgramStream,
    setPreviewStream,
    cutProgramPreview,
    setStreamVolume,
    toggleStreamMute,
    toggleStreamSolo,
    setStreamAudioDelay,
    sendRemoteControl,
    sendCue,
    addSyntheticStream
  } = useLiveLink();

  const simulateFourCameras = () => {
    addSyntheticStream('Cam 1 - Stage Left', 1920, 1080, 60);
    addSyntheticStream('Cam 2 - Center Stage', 1920, 1080, 60);
    addSyntheticStream('Cam 3 - Close Up', 1920, 1080, 60);
    addSyntheticStream('Cam 4 - Wide Crane', 1920, 1080, 60);
  };

  const [activeRemoteControlStream, setActiveRemoteControlStream] = useState<CameraStream | null>(null);
  const [cueModalOpen, setCueModalOpen] = useState(false);
  const [cueText, setCueText] = useState('');
  const [cueTarget, setCueTarget] = useState<string>('all');

  // Multi-stream ISO Recorder manager
  const isoManagerRef = useRef<IsoRecorderManager>(new IsoRecorderManager());
  const [isIsoRecording, setIsIsoRecording] = useState(false);
  const [isoDuration, setIsoDuration] = useState(0);

  // Clean OBS URL copied state
  const [copiedStreamId, setCopiedStreamId] = useState<string | null>(null);

  // Audio delay drawer open state
  const [audioMixerOpen, setAudioMixerOpen] = useState(false);
  const [linksModalOpen, setLinksModalOpen] = useState(false);

  // Keyboard shortcuts for switcher: 1-9 to select preview/program, Space to CUT, R to record
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= cameraStreams.length) {
        const stream = cameraStreams[num - 1];
        if (e.shiftKey) {
          setProgramStream(stream.id);
        } else {
          setPreviewStream(stream.id);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        cutProgramPreview();
      } else if (e.key === 'r' || e.key === 'R') {
        toggleIsoRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cameraStreams, setProgramStream, setPreviewStream, cutProgramPreview]);

  // ISO Recording toggle
  const toggleIsoRecording = () => {
    const mgr = isoManagerRef.current;
    if (isIsoRecording) {
      mgr.stopAll();
      setIsIsoRecording(false);
      setIsoDuration(0);
    } else {
      if (cameraStreams.length === 0) return;
      mgr.startAll(cameraStreams.map(s => ({ id: s.id, label: s.label, mediaStream: s.mediaStream })));
      setIsIsoRecording(true);
    }
  };

  // Dispatch director cue
  const handleSendCue = () => {
    if (!cueText.trim()) return;
    sendCue(cueTarget, cueText.trim(), 6000);
    setCueText('');
    setCueModalOpen(false);
  };

  const copyCleanUrl = (streamId: string) => {
    const cleanUrl = `${window.location.origin}/view/${roomId}/${streamId}`;
    navigator.clipboard.writeText(cleanUrl);
    setCopiedStreamId(streamId);
    setTimeout(() => setCopiedStreamId(null), 2000);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Determine grid layout columns
  const streamCount = cameraStreams.length;
  const gridColsClass =
    streamCount <= 1 ? 'grid-cols-1' :
    streamCount === 2 ? 'grid-cols-1 md:grid-cols-2' :
    streamCount <= 4 ? 'grid-cols-1 md:grid-cols-2' :
    streamCount <= 6 ? 'grid-cols-2 lg:grid-cols-3' :
    'grid-cols-2 lg:grid-cols-4';

  return (
    <div className="min-h-[calc(100vh-53px)] bg-zinc-950 p-4 flex flex-col justify-between text-zinc-100">
      {/* Top Production Switching Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-zinc-900/80 p-3 rounded-2xl border border-zinc-800 shadow-xl">
        {/* Switcher Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">PROGRAM:</span>
            <span className="px-2.5 py-1 rounded bg-red-950/60 text-red-400 font-mono text-xs font-bold border border-red-500/40">
              {programStreamId ? cameraStreams.find(s => s.id === programStreamId)?.label || programStreamId : 'NONE'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400">PREVIEW:</span>
            <span className="px-2.5 py-1 rounded bg-emerald-950/60 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/40">
              {previewStreamId ? cameraStreams.find(s => s.id === previewStreamId)?.label || previewStreamId : 'NONE'}
            </span>
          </div>

          {/* CUT Button */}
          <button
            onClick={cutProgramPreview}
            className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-red-950/50 transition-transform active:scale-95"
            title="Swap Preview to Program (Spacebar)"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>CUT (Space)</span>
          </button>
        </div>

        {/* Right Production Actions */}
        <div className="flex items-center gap-2.5">
          {/* Broadcast Links & Feeds Button */}
          <button
            onClick={() => setLinksModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-950/40 transition-transform active:scale-95"
            title="Get worldwide links for each camera feed"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Broadcast Links</span>
          </button>

          {/* Cue Director Button */}
          <button
            onClick={() => setCueModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Director Cue</span>
          </button>

          {/* Audio Mixer Toggle */}
          <button
            onClick={() => setAudioMixerOpen(!audioMixerOpen)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors',
              audioMixerOpen
                ? 'bg-zinc-700 text-white border-zinc-600'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
            )}
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Audio Mixer</span>
          </button>

          {/* ISO Multi-Camera Recording */}
          <button
            onClick={toggleIsoRecording}
            className={clsx(
              'px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all',
              isIsoRecording
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
            )}
          >
            <Circle className={clsx('w-3 h-3 fill-current', isIsoRecording ? 'text-white' : 'text-red-500')} />
            <span>{isIsoRecording ? `REC ALL (${formatDuration(isoDuration)})` : 'ISO Record (R)'}</span>
          </button>
        </div>
      </div>

      {/* Main Multiview Grid */}
      {cameraStreams.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl p-12 text-center my-auto">
          <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-500">
            <Radio className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Awaiting Camera Senders</h2>
          <p className="text-zinc-400 text-sm max-w-md mb-6">
            Connect camera laptops over your LAN by clicking "Connect Cameras" in the top bar or navigating to the Sender tab.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={simulateFourCameras}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-950/40"
            >
              <span>Simulate 4 Cameras (1080p60)</span>
            </button>
            <a
              href={`/sender?room=${roomId}`}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 border border-zinc-700"
            >
              Open Camera Sender
            </a>
          </div>
        </div>
      ) : (
        <div className={clsx('grid gap-4 flex-1 items-stretch', gridColsClass)}>
          {cameraStreams.map((stream, idx) => {
            const isProgram = programStreamId === stream.id;
            const isPreview = previewStreamId === stream.id;

            return (
              <div
                key={stream.id}
                className={clsx(
                  'relative group bg-zinc-900 rounded-2xl overflow-hidden border-2 transition-all duration-200 flex flex-col justify-between shadow-xl',
                  isProgram ? 'border-red-500 ring-4 ring-red-500/20' :
                  isPreview ? 'border-emerald-500 ring-4 ring-emerald-500/20' :
                  'border-zinc-800/80 hover:border-zinc-700'
                )}
              >
                {/* Video Container */}
                <div
                  className="relative aspect-video w-full bg-black cursor-pointer overflow-hidden"
                  onClick={() => {
                    if (isPreview) {
                      setProgramStream(stream.id);
                    } else {
                      setPreviewStream(stream.id);
                    }
                  }}
                >
                  <StreamVideoPlayer mediaStream={stream.mediaStream} />

                  {/* Top Bar inside Video: Label, Tally & Index */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                      <span className="w-5 h-5 rounded-md bg-black/75 backdrop-blur-md text-[11px] font-mono font-black text-white flex items-center justify-center border border-white/20">
                        {idx + 1}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md text-xs font-bold text-white border border-white/20">
                        {stream.label}
                      </span>
                      <TallyBadge state={isProgram ? 'program' : isPreview ? 'preview' : 'standby'} />
                    </div>

                    {/* Quick Tools: OBS Link, Remote Control */}
                    <div className="flex items-center gap-1.5 pointer-events-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyCleanUrl(stream.id); }}
                        title="Copy Clean OBS Browser Source Link"
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 backdrop-blur-md text-zinc-300 hover:text-white border border-white/10"
                      >
                        {copiedStreamId === stream.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveRemoteControlStream(stream); }}
                        title="Remote Control Camera Laptop"
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 backdrop-blur-md text-zinc-300 hover:text-white border border-white/10"
                      >
                        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Stats HUD */}
                  <div className="absolute bottom-3 left-3 right-3 pointer-events-auto">
                    <StatsHUD stats={stream.stats} />
                  </div>
                </div>

                {/* Bottom Stream Audio strip */}
                <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      onClick={() => toggleStreamMute(stream.id)}
                      className={clsx('p-1 rounded text-zinc-400 hover:text-white', stream.isMuted && 'text-red-500')}
                    >
                      {stream.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <AudioVU
                      volume={stream.audioVolume}
                      isMuted={stream.isMuted}
                      orientation="horizontal"
                      className="flex-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStreamSolo(stream.id)}
                      className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors',
                        stream.isSolo
                          ? 'bg-amber-500 text-black'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      )}
                    >
                      SOLO
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-out Audio Mixer Drawer */}
      {audioMixerOpen && (
        <div className="mt-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              Live Multi-Channel Audio Mixer & Lip-Sync Delays
            </h4>
            <button
              onClick={() => setAudioMixerOpen(false)}
              className="text-xs text-zinc-400 hover:text-white font-medium"
            >
              Close Mixer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cameraStreams.map((s) => (
              <div key={s.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-200">
                  <span className="truncate">{s.label}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{s.id.substring(0, 6)}</span>
                </div>

                {/* Volume Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Fader:</span>
                    <span className="font-mono text-zinc-200">{Math.round(s.audioVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={s.audioVolume}
                    onChange={(e) => setStreamVolume(s.id, Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded appearance-none accent-cyan-500"
                  />
                </div>

                {/* Lip-Sync Delay Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Lip-Sync Delay:</span>
                    <span className="font-mono text-cyan-400">{s.audioDelayMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={s.audioDelayMs}
                    onChange={(e) => setStreamAudioDelay(s.id, Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded appearance-none accent-cyan-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remote Control Modal */}
      {activeRemoteControlStream && (
        <RemoteControlModal
          stream={activeRemoteControlStream}
          onClose={() => setActiveRemoteControlStream(null)}
          onSendCommand={(command, payload) => {
            sendRemoteControl(activeRemoteControlStream.peerId, command, payload);
          }}
        />
      )}

      {/* Director Cue Dialog */}
      {cueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              Broadcast Director Cue
            </h3>
            <p className="text-zinc-400 text-xs mb-4">
              Send high-visibility cues directly to camera operators' laptop screens.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Target Camera</label>
                <select
                  value={cueTarget}
                  onChange={(e) => setCueTarget(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="all">Broadcast to All Cameras</option>
                  {cameraStreams.map(s => (
                    <option key={s.id} value={s.peerId}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Cue Message</label>
                <input
                  type="text"
                  value={cueText}
                  onChange={(e) => setCueText(e.target.value)}
                  placeholder="e.g. Cam 2: Zoom in on speaker / 30s to break"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCueModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSendCue}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
              >
                Send Cue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Links Modal */}
      {linksModalOpen && (
        <BroadcastLinksModal
          cameraStreams={cameraStreams}
          serverInfo={serverInfo}
          roomId={roomId}
          onClose={() => setLinksModalOpen(false)}
        />
      )}
    </div>
  );
};
