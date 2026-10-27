export interface AudioConstraintsOptions {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  stereo?: boolean;
}

export function getProductionAudioConstraints(options: AudioConstraintsOptions = {}): MediaTrackConstraints {
  const {
    deviceId,
    echoCancellation = false, // Disabled by default for camera feeds
    noiseSuppression = false, // Disabled by default for camera feeds
    autoGainControl = false,  // Disabled by default for camera feeds
    sampleRate = 48000,
    stereo = true
  } = options;

  return {
    deviceId: deviceId ? { ideal: deviceId } : undefined,
    echoCancellation: echoCancellation,
    noiseSuppression: noiseSuppression,
    autoGainControl: autoGainControl,
    sampleRate: { ideal: sampleRate },
    channelCount: { ideal: stereo ? 2 : 1 }
  };
}

export class AudioMixerNode {
  private ctx: AudioContext;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private delayNode: DelayNode;
  private gainNode: GainNode;
  private analyserNode: AnalyserNode;
  private destinationNode: MediaStreamAudioDestinationNode;
  private dataArray: Uint8Array;

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
    this.delayNode = this.ctx.createDelay(2.0); // max 2 seconds delay
    this.gainNode = this.ctx.createGain();
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.5;
    this.destinationNode = this.ctx.createMediaStreamDestination();
    this.dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    // Audio graph: Source -> Delay -> Gain -> Analyser -> Destination / Speakers
    this.delayNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.destinationNode);
  }

  attachStream(stream: MediaStream): MediaStream {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return stream;

    this.sourceNode = this.ctx.createMediaStreamSource(stream);
    this.sourceNode.connect(this.delayNode);

    // Return combined stream with processed audio track
    const processedTrack = this.destinationNode.stream.getAudioTracks()[0];
    const newStream = new MediaStream([
      ...stream.getVideoTracks(),
      processedTrack
    ]);
    return newStream;
  }

  setVolume(volume: number) {
    this.gainNode.gain.setValueAtTime(Math.max(0, volume), this.ctx.currentTime);
  }

  setDelayMs(delayMs: number) {
    const delaySec = Math.max(0, Math.min(2.0, delayMs / 1000));
    this.delayNode.delayTime.setValueAtTime(delaySec, this.ctx.currentTime);
  }

  connectToSpeakers() {
    try {
      this.gainNode.connect(this.ctx.destination);
    } catch (e) {
      // already connected
    }
  }

  disconnectSpeakers() {
    try {
      this.gainNode.disconnect(this.ctx.destination);
    } catch (e) {
      // ignore
    }
  }

  getLevel(): { rms: number; peak: number } {
    this.analyserNode.getByteTimeDomainData(this.dataArray);
    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      const abs = Math.abs(normalized);
      if (abs > peak) peak = abs;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / this.dataArray.length);
    return {
      rms: Math.min(1.0, rms * 1.5),
      peak: Math.min(1.0, peak)
    };
  }

  destroy() {
    try {
      this.ctx.close();
    } catch (e) {
      // ignore
    }
  }
}
