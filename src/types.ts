export type SourceType = 'camera' | 'screen' | 'software' | 'audio' | 'synthetic';

export type ResolutionPreset = '4k' | '1440p' | '1080p' | '720p' | '480p' | 'custom';

export type CodecType = 'h264' | 'vp9' | 'av1' | 'vp8';

export type DegradationPreference = 'maintain-framerate' | 'maintain-resolution' | 'balanced';

export type LatencyMode = 'ultra-low' | 'smooth';

export type TallyState = 'program' | 'preview' | 'standby';

export interface SenderSettings {
  sourceType: SourceType;
  deviceId: string;
  audioDeviceId: string;
  resolution: ResolutionPreset;
  customWidth?: number;
  customHeight?: number;
  frameRate: number; // 24, 25, 30, 50, 60
  bitrateKbps: number; // 5000 to 100000 (100 Mbps)
  codec: CodecType;
  degradationPreference: DegradationPreference;
  latencyMode: LatencyMode;
  contentHint: 'motion' | 'detail';
  stereo: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  audioDelayMs: number;
  sourceLabel: string;
}

export interface StreamStats {
  fps: number;
  bitrateKbps: number;
  width: number;
  height: number;
  rttMs: number;
  packetLossPercent: number;
  jitterMs: number;
  encoder?: string;
  decoder?: string;
  droppedFrames: number;
  health: 'green' | 'yellow' | 'red';
  timestamp: number;
}

export interface CameraStream {
  id: string;
  peerId: string;
  label: string;
  mediaStream: MediaStream;
  stats?: StreamStats;
  tally: TallyState;
  audioVolume: number; // 0.0 to 1.5
  isMuted: boolean;
  isSolo: boolean;
  audioDelayMs: number;
  settings?: Partial<SenderSettings>;
}

export interface RemoteControlPayload {
  command: 'set-bitrate' | 'set-fps' | 'set-resolution' | 'toggle-mute' | 'restart-stream' | 'request-keyframe';
  value?: any;
}

export interface CueMessage {
  id: string;
  message: string;
  from: string;
  timestamp: number;
  durationMs: number;
}

export interface ServerInfo {
  name: string;
  version: string;
  port: number;
  primaryIp: string;
  lanIps: string[];
  lanUrl: string;
  publicUrl?: string;
  shareUrl?: string;
  defaultRoom: string;
  qrDataUri?: string;
  stats?: {
    activeRooms: number;
    totalSenders: number;
    totalReceivers: number;
  };
}
