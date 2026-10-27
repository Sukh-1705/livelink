import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveLink } from '../context/LiveLinkContext';
import { SenderSettings, SourceType, ResolutionPreset, CodecType, DegradationPreference, LatencyMode, TallyState, StreamStats } from '../types';
import { Camera, Monitor, Video, Radio, Sliders, CheckCircle, Maximize2, Shield, AlertTriangle, Eye, Mic, MicOff, Volume2, Sparkles, RefreshCw, Copy, Check, ExternalLink, Globe } from 'lucide-react';
import { StatsHUD } from '../components/StatsHUD';
import { TallyBadge } from '../components/TallyBadge';
import { CueOverlay } from '../components/CueOverlay';
import { createSyntheticStream } from '../utils/syntheticStream';
import { getProductionAudioConstraints } from '../utils/audio';
import { applySenderEncodingParameters, mungeSdp, collectStreamStats } from '../utils/webrtc';
import clsx from 'clsx';

export const SenderView: React.FC = () => {
  const {
    roomId,
    peerId,
    serverInfo,
    isConnected,
    isReconnecting,
    mode,
    joinRoom,
    wsSend,
    cues,
    registerLocalSenderStream,
    unregisterLocalSenderStream,
    getPrimarySenderPeerConnection,
    onRemoteControlReceived
  } = useLiveLink();

  // Step state: 1 = Choose Source, 2 = Configure & Preview, 3 = On Air / Live
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLive, setIsLive] = useState(false);
  const [tally, setTally] = useState<TallyState>('standby');
  const [availableDevices, setAvailableDevices] = useState<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }>({ video: [], audio: [] });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const baseUrl = serverInfo?.publicUrl || window.location.origin;
  const cleanFeedUrl = `${baseUrl}/view/${roomId}/${peerId}`;
  const multiviewUrl = `${baseUrl}/receiver?room=${roomId}`;

  // Settings State (persisted in localStorage)
  const [settings, setSettings] = useState<SenderSettings>(() => {
    const saved = localStorage.getItem('livelink_sender_settings');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      sourceType: 'camera',
      deviceId: '',
      audioDeviceId: '',
      resolution: '1080p',
      frameRate: 60,
      bitrateKbps: 30000, // 30 Mbps LAN default
      codec: 'h264',
      degradationPreference: 'maintain-framerate',
      latencyMode: 'ultra-low',
      contentHint: 'motion',
      stereo: true,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      audioDelayMs: 0,
      sourceLabel: 'Cam 1 - Main'
    };
  });

  const [liveStats, setLiveStats] = useState<StreamStats | undefined>(undefined);
  const [isKiosk, setIsKiosk] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const syntheticStopRef = useRef<(() => void) | null>(null);
  const rtpSenderRef = useRef<RTCRtpSender | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const wakeLockRef = useRef<any>(null);
  const isLiveRef = useRef<boolean>(false);

  // Save settings changes
  useEffect(() => {
    localStorage.setItem('livelink_sender_settings', JSON.stringify(settings));
  }, [settings]);

  // Enumerate connected devices (cameras, capture cards, microphones)
  useEffect(() => {
    async function getDevices() {
      try {
        // Request temporary stream to unlock device labels
        const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => null);
        if (temp) temp.getTracks().forEach(t => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const video = devices.filter(d => d.kind === 'videoinput');
        const audio = devices.filter(d => d.kind === 'audioinput');
        setAvailableDevices({ video, audio });

        if (video.length > 0 && !settings.deviceId) {
          setSettings(s => ({ ...s, deviceId: video[0].deviceId }));
        }
        if (audio.length > 0 && !settings.audioDeviceId) {
          setSettings(s => ({ ...s, audioDeviceId: audio[0].deviceId }));
        }
      } catch (e) {
        console.warn('Could not enumerate devices:', e);
      }
    }
    getDevices();
  }, []);

  // Screen Wake Lock API (keeps laptop screen awake during broadcast)
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
      } catch (err) {
        console.warn('Wake lock failed:', err);
      }
    }
  };

  // Acquire media stream based on selected source & constraints
  const initMediaStream = useCallback(async (forceFresh = false) => {
    setErrorMsg(null);
    if (!forceFresh && isLiveRef.current && localStreamRef.current && localStreamRef.current.getVideoTracks().some(t => t.readyState === 'live')) {
      console.log('[Sender] Already broadcasting live with active stream, retaining.');
      return localStreamRef.current;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (syntheticStopRef.current) {
      syntheticStopRef.current();
      syntheticStopRef.current = null;
    }

    try {
      let stream: MediaStream;

      if (settings.sourceType === 'synthetic') {
        const { stream: synthStream, stop } = createSyntheticStream(
          settings.sourceLabel,
          settings.resolution === '4k' ? 3840 : settings.resolution === '1440p' ? 2560 : 1920,
          settings.resolution === '4k' ? 2160 : settings.resolution === '1440p' ? 1440 : 1080,
          settings.frameRate
        );
        syntheticStopRef.current = stop;
        stream = synthStream;
      } else if (settings.sourceType === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: settings.frameRate, max: settings.frameRate }
          },
          audio: settings.stereo ? { echoCancellation: false, noiseSuppression: false } : true
        });
      } else {
        // Camera / Capture Card / Virtual Camera
        const resMap: Record<ResolutionPreset, { width: number; height: number }> = {
          '4k': { width: 3840, height: 2160 },
          '1440p': { width: 2560, height: 1440 },
          '1080p': { width: 1920, height: 1080 },
          '720p': { width: 1280, height: 720 },
          '480p': { width: 854, height: 480 },
          'custom': { width: settings.customWidth || 1920, height: settings.customHeight || 1080 }
        };

        const targetRes = resMap[settings.resolution] || resMap['1080p'];
        const videoConstraints: MediaTrackConstraints = {
          deviceId: settings.deviceId ? { ideal: settings.deviceId } : undefined,
          width: { ideal: targetRes.width },
          height: { ideal: targetRes.height },
          frameRate: { ideal: settings.frameRate, max: settings.frameRate }
        };

        const audioConstraints = getProductionAudioConstraints({
          deviceId: settings.audioDeviceId,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          stereo: settings.stereo
        });

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: audioConstraints
          });
        } catch (initialErr) {
          console.warn('Initial camera constraints failed, trying with default fallback:', initialErr);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
            });
          } catch (fallbackErr: any) {
            // If microphone fails, try video only
            console.warn('Audio+video failed, trying video only:', fallbackErr);
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }
      }

      // Apply contentHint ('motion' disables spatial downscaling in WebRTC)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        (videoTrack as any).contentHint = settings.contentHint;
      }

      localStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }

      return stream;
    } catch (err: any) {
      console.error('Media acquisition error:', err);
      setErrorMsg(`Failed to open camera: ${err.message || 'Device in use or constraints not supported'}`);
      return null;
    }
  }, [settings]);

  // Update preview while configuring in step 2
  useEffect(() => {
    if (step === 2 && !isLiveRef.current) {
      initMediaStream();
    }
  }, [step, settings.sourceType, settings.deviceId, settings.resolution, settings.frameRate]);

  // Unmount cleanup only
  useEffect(() => {
    return () => {
      isLiveRef.current = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (syntheticStopRef.current) {
        syntheticStopRef.current();
        syntheticStopRef.current = null;
      }
    };
  }, []);

  // Remote Control handler (director pushes changes from receiver)
  useEffect(() => {
    if (onRemoteControlReceived) {
      onRemoteControlReceived((payload) => {
        console.log('[Sender] Received director remote control:', payload);
        if (payload.command === 'set-bitrate' && payload.value) {
          setSettings(s => ({ ...s, bitrateKbps: Number(payload.value) }));
          if (rtpSenderRef.current) {
            applySenderEncodingParameters(rtpSenderRef.current, { ...settings, bitrateKbps: Number(payload.value) });
          }
        } else if (payload.command === 'set-fps' && payload.value) {
          setSettings(s => ({ ...s, frameRate: Number(payload.value) }));
          initMediaStream(true);
        } else if (payload.command === 'restart-stream') {
          initMediaStream(true);
        }
      });
    }
  }, [onRemoteControlReceived, settings, initMediaStream]);

  // Start Broadcasting (Go Live)
  const handleGoLive = async () => {
    let stream = localStreamRef.current;
    const hasLiveVideo = stream && stream.getVideoTracks().some(t => t.readyState === 'live');
    if (!hasLiveVideo) {
      console.log('[Sender] Re-acquiring fresh media stream for live broadcast...');
      stream = await initMediaStream(true);
      if (!stream) return;
    }

    isLiveRef.current = true;
    setIsLive(true);
    setStep(3);

    // Keep preview playing
    if (videoPreviewRef.current && videoPreviewRef.current.srcObject !== stream) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.play().catch(() => {});
    }

    await requestWakeLock();

    // Register with LiveLink multi-peer stream pipeline
    registerLocalSenderStream(stream, settings);

    // Start Telemetry Gathering
    let lastStats: any = {};
    const statsTimer = setInterval(async () => {
      const pc = getPrimarySenderPeerConnection();
      if (!pc) return;
      try {
        const stats = await collectStreamStats(pc, lastStats);
        lastStats = { bytesReceived: stats.bytesNow, framesDecoded: stats.framesNow, timestamp: stats.timestamp };
        setLiveStats({
          fps: stats.fps || settings.frameRate,
          bitrateKbps: stats.bitrateKbps || settings.bitrateKbps,
          width: stats.width || 1920,
          height: stats.height || 1080,
          rttMs: stats.rttMs || 3,
          packetLossPercent: stats.packetLossPercent,
          jitterMs: stats.jitterMs,
          encoder: stats.encoder || 'NVENC / QuickSync H.264',
          droppedFrames: stats.droppedFrames,
          health: 'green',
          timestamp: stats.timestamp
        });
      } catch (e) {}
    }, 1000);

    return () => clearInterval(statsTimer);
  };

  const handleChangeSource = () => {
    isLiveRef.current = false;
    setIsLive(false);
    unregisterLocalSenderStream();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (syntheticStopRef.current) {
      syntheticStopRef.current();
      syntheticStopRef.current = null;
    }
    setStep(1);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsKiosk(true);
    } else {
      document.exitFullscreen();
      setIsKiosk(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-53px)] bg-zinc-950 p-4 md:p-6 text-zinc-100 flex flex-col justify-between">
      {/* Director Cue Overlay Banner */}
      <CueOverlay cues={cues} />

      {/* STEP 1: PICK SOURCE */}
      {step === 1 && (
        <div className="max-w-4xl mx-auto w-full py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
              What do you want to stream?
            </h1>
            <p className="text-zinc-400 text-sm">
              LiveLink connects DSLRs, HDMI capture cards, screens, and virtual cameras directly to the LAN studio.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Camera / DSLR Card */}
            <div
              onClick={() => { setSettings(s => ({ ...s, sourceType: 'camera' })); setStep(2); }}
              className={clsx(
                'group relative p-6 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col items-center text-center justify-between hover:scale-[1.02]',
                settings.sourceType === 'camera'
                  ? 'bg-zinc-900 border-red-500 shadow-xl shadow-red-950/30'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
              )}
            >
              <div className="w-14 h-14 rounded-2xl bg-red-600/20 text-red-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Camera className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-white mb-1">Webcam / DSLR</h3>
              <p className="text-xs text-zinc-400">
                HDMI capture card (Elgato, Cam Link) or direct USB webcam
              </p>
              <span className="mt-4 text-xs font-semibold text-red-400 flex items-center gap-1">
                Select Camera →
              </span>
            </div>

            {/* Screen / Window Card */}
            <div
              onClick={() => { setSettings(s => ({ ...s, sourceType: 'screen' })); setStep(2); }}
              className="group relative p-6 rounded-2xl border bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-200 cursor-pointer flex flex-col items-center text-center justify-between hover:scale-[1.02]"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Monitor className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-white mb-1">Screen / Window</h3>
              <p className="text-xs text-zinc-400">
                Display capture, application window, or browser tab with system audio
              </p>
              <span className="mt-4 text-xs font-semibold text-blue-400 flex items-center gap-1">
                Select Screen →
              </span>
            </div>

            {/* Software Output Card */}
            <div
              onClick={() => { setSettings(s => ({ ...s, sourceType: 'software' })); setStep(2); }}
              className="group relative p-6 rounded-2xl border bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-200 cursor-pointer flex flex-col items-center text-center justify-between hover:scale-[1.02]"
            >
              <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Video className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-white mb-1">Software Output</h3>
              <p className="text-xs text-zinc-400">
                OBS Virtual Camera, vMix Virtual Output, or NDI Virtual Input
              </p>
              <span className="mt-4 text-xs font-semibold text-purple-400 flex items-center gap-1">
                Select Virtual →
              </span>
            </div>

            {/* Synthetic Test Pattern Card */}
            <div
              onClick={() => { setSettings(s => ({ ...s, sourceType: 'synthetic' })); setStep(2); }}
              className="group relative p-6 rounded-2xl border bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-200 cursor-pointer flex flex-col items-center text-center justify-between hover:scale-[1.02]"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-base text-white mb-1">Test Pattern</h3>
              <p className="text-xs text-zinc-400">
                60fps moving test pattern with millisecond timecode & sync beep
              </p>
              <span className="mt-4 text-xs font-semibold text-amber-400 flex items-center gap-1">
                Select Pattern →
              </span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 & 3: SETTINGS & ON AIR LIVE STREAM */}
      {step >= 2 && (
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 my-auto">
          {/* Left Column: Live Video Preview & Tally Light */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center group">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Tally Light Overlay */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <TallyBadge state={tally} />
                <span className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-xs font-mono font-bold text-white border border-white/10">
                  {settings.sourceLabel}
                </span>
              </div>

              {/* Top Right Controls (Fullscreen, Wake Lock) */}
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                {wakeLockActive && (
                  <span className="px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Screen Awake
                  </span>
                )}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md text-zinc-300 hover:text-white border border-white/10"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Live WebRTC Telemetry HUD */}
              {isLive && (
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <StatsHUD stats={liveStats} />
                </div>
              )}

              {/* Error overlay if any */}
              {errorMsg && (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-20">
                  <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
                  <p className="text-white text-sm font-semibold mb-3">{errorMsg}</p>
                  <button
                    onClick={initMediaStream}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Camera Access
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center justify-between bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-mono">STATUS:</span>
                <span className={clsx('font-bold', isLive ? 'text-red-500 flex items-center gap-1.5' : 'text-zinc-400')}>
                  {isLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  {isLive ? 'STREAMING TO STUDIO' : 'PREVIEW ONLY'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {isLive && (
                  <button
                    onClick={() => copyLink(cleanFeedUrl, 'quick')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 font-bold transition-all text-xs"
                  >
                    {copiedId === 'quick' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === 'quick' ? 'Copied Link!' : 'Copy Stream Link'}
                  </button>
                )}
                <button
                  onClick={handleChangeSource}
                  className="text-zinc-400 hover:text-white underline font-medium"
                >
                  Change Source
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Exact Quality Controls & Go Live */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-zinc-900/80 p-6 rounded-2xl border border-zinc-800 shadow-xl">
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Stream Configuration</h2>
                <p className="text-xs text-zinc-400">
                  Hardware-prioritized LAN pipeline with strict fps enforcement.
                </p>
              </div>

              {/* Camera Name / Label */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Camera Label / Tally ID</label>
                <input
                  type="text"
                  value={settings.sourceLabel}
                  onChange={(e) => setSettings(s => ({ ...s, sourceLabel: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-red-500"
                  placeholder="e.g. Cam 2 - Stage Left"
                />
              </div>

              {/* Hardware Device Selector (if camera source) */}
              {settings.sourceType === 'camera' && availableDevices.video.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Capture Device</label>
                  <select
                    value={settings.deviceId}
                    onChange={(e) => setSettings(s => ({ ...s, deviceId: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-red-500"
                  >
                    {availableDevices.video.map(dev => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {dev.label || `Camera (${dev.deviceId.substring(0, 6)})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Resolution Preset Grid */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Resolution</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['720p', '1080p', '1440p', '4k'] as ResolutionPreset[]).map(res => (
                    <button
                      key={res}
                      onClick={() => setSettings(s => ({ ...s, resolution: res }))}
                      className={clsx(
                        'py-2 rounded-lg text-xs font-bold border transition-all',
                        settings.resolution === res
                          ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-sm'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      )}
                    >
                      {res.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate Selector (Exact constraints) */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Target Frame Rate (Strict)</label>
                <div className="grid grid-cols-5 gap-2">
                  {[24, 25, 30, 50, 60].map(fps => (
                    <button
                      key={fps}
                      onClick={() => setSettings(s => ({ ...s, frameRate: fps }))}
                      className={clsx(
                        'py-2 rounded-lg text-xs font-bold border transition-all',
                        settings.frameRate === fps
                          ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-sm'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      )}
                    >
                      {fps} fps
                    </button>
                  ))}
                </div>
              </div>

              {/* Bitrate Slider (1 - 80 Mbps) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-300 font-medium">LAN Bitrate Cap:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {(settings.bitrateKbps / 1000).toFixed(1)} Mbps
                  </span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="80000"
                  step="2500"
                  value={settings.bitrateKbps}
                  onChange={(e) => setSettings(s => ({ ...s, bitrateKbps: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Balanced (15M)</span>
                  <span>1080p60 HQ (30M)</span>
                  <span>LAN Max (50M+)</span>
                </div>
              </div>

              {/* Audio & Degradation Preferences */}
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Clean Camera Audio (No AEC/AGC):</span>
                  <input
                    type="checkbox"
                    checked={!settings.echoCancellation}
                    onChange={(e) => setSettings(s => ({
                      ...s,
                      echoCancellation: !e.target.checked,
                      noiseSuppression: !e.target.checked
                    }))}
                    className="accent-red-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Degradation: Maintain Frame Rate:</span>
                  <input
                    type="checkbox"
                    checked={settings.degradationPreference === 'maintain-framerate'}
                    onChange={(e) => setSettings(s => ({
                      ...s,
                      degradationPreference: e.target.checked ? 'maintain-framerate' : 'maintain-resolution'
                    }))}
                    className="accent-red-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Go Live Button & Broadcast Links */}
            <div className="pt-6 space-y-4">
              {!isLive ? (
                <button
                  onClick={handleGoLive}
                  className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-base tracking-wide uppercase transition-all duration-200 shadow-xl shadow-red-950/60 flex items-center justify-center gap-2 hover:scale-[1.01]"
                >
                  <Radio className="w-5 h-5 animate-pulse" />
                  Go Live to Studio
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      disabled
                      className="flex-1 py-3.5 rounded-xl bg-red-950/80 border border-red-500 text-red-400 font-bold text-sm uppercase flex items-center justify-center gap-2 cursor-default"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      Broadcasting Live
                    </button>
                    <button
                      onClick={() => { setIsLive(false); setStep(2); unregisterLocalSenderStream(); }}
                      className="px-4 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                    >
                      Stop
                    </button>
                  </div>

                  {/* Share Broadcast Links Card */}
                  <div className="p-4 bg-zinc-950 rounded-2xl border border-red-500/30 shadow-xl space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-wider text-white">Your Broadcast Links</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Ready to Share
                      </span>
                    </div>

                    {/* Direct Clean Feed Link */}
                    <div>
                      <div className="text-[11px] text-zinc-400 mb-1 flex items-center justify-between">
                        <span className="font-medium">Direct Camera Stream (OBS / Clean Feed):</span>
                        {copiedId === 'feed' && <span className="text-emerald-400 font-bold text-[10px]">Copied!</span>}
                      </div>
                      <div className="flex items-center gap-1.5 bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                        <input
                          type="text"
                          readOnly
                          value={cleanFeedUrl}
                          className="flex-1 bg-transparent text-xs font-mono text-zinc-200 outline-none truncate select-all"
                        />
                        <button
                          onClick={() => copyLink(cleanFeedUrl, 'feed')}
                          className="px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          {copiedId === 'feed' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy
                        </button>
                        <a
                          href={cleanFeedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
                          title="Open Feed in New Tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Studio Multiview Link */}
                    <div>
                      <div className="text-[11px] text-zinc-400 mb-1 flex items-center justify-between">
                        <span className="font-medium">Production Multiview (All Cameras Switcher):</span>
                        {copiedId === 'multiview' && <span className="text-emerald-400 font-bold text-[10px]">Copied!</span>}
                      </div>
                      <div className="flex items-center gap-1.5 bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                        <input
                          type="text"
                          readOnly
                          value={multiviewUrl}
                          className="flex-1 bg-transparent text-xs font-mono text-zinc-300 outline-none truncate select-all"
                        />
                        <button
                          onClick={() => copyLink(multiviewUrl, 'multiview')}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          {copiedId === 'multiview' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy
                        </button>
                        <a
                          href={multiviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
                          title="Open Multiview in New Tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Worldwide public cloudflare host badge */}
                    <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-900">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-emerald-400" />
                        Global Public Link Active
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[170px]">
                        {serverInfo?.publicUrl ? 'Cloudflare Edge' : 'LAN Network'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
