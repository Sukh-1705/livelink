import { SenderSettings, LatencyMode } from '../types';

/**
 * Custom SDP munger to enforce LAN Max bitrates, prevent WebRTC GCC downscaling,
 * and force high-quality stereo Opus.
 */
export function mungeSdp(sdp: string, bitrateKbps: number, stereo = true): string {
  let lines = sdp.split('\r\n');
  let inAudioSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('m=audio')) {
      inAudioSection = true;
    } else if (line.startsWith('m=')) {
      inAudioSection = false;
    }

    // Set high-bitrate stereo Opus parameters
    if (inAudioSection && line.startsWith('a=fmtp:') && line.includes('opus')) {
      if (stereo && !line.includes('stereo=1')) {
        lines[i] = `${line};stereo=1;sprop-stereo=1;maxaveragebitrate=256000;cbr=1`;
      }
    }
  }

  return lines.join('\r\n');
}

/**
 * Applies strict encoding parameters to the video sender without renegotiating SDP.
 */
export async function applySenderEncodingParameters(
  sender: RTCRtpSender,
  settings: SenderSettings
): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const maxBps = Math.max(2500000, settings.bitrateKbps * 1000);

    params.encodings[0].maxBitrate = maxBps;
    params.encodings[0].maxFramerate = settings.frameRate;
    params.encodings[0].scaleResolutionDownBy = 1.0;
    (params.encodings[0] as any).priority = 'high';
    (params.encodings[0] as any).networkPriority = 'high';

    // Apply degradation preference
    if ('degradationPreference' in sender) {
      (sender as any).degradationPreference = settings.degradationPreference;
    }

    await sender.setParameters(params);
    console.log(`[WebRTC] Applied encoding parameters: ${settings.bitrateKbps} kbps max, ${settings.frameRate} fps, ${settings.degradationPreference}`);
  } catch (err) {
    console.warn('[WebRTC] Failed to set sender parameters:', err);
  }
}

/**
 * Tunes jitter buffer on receiver for ultra-low latency LAN playout.
 */
export function tuneReceiverJitterBuffer(
  receiver: RTCRtpReceiver,
  latencyMode: LatencyMode = 'ultra-low'
): void {
  try {
    const isUltraLow = latencyMode === 'ultra-low';
    
    // W3C playoutDelayHint (seconds)
    if ('playoutDelayHint' in receiver) {
      (receiver as any).playoutDelayHint = isUltraLow ? 0.0 : 0.04;
    }
    
    // W3C jitterBufferTarget (milliseconds)
    if ('jitterBufferTarget' in receiver) {
      (receiver as any).jitterBufferTarget = isUltraLow ? 0 : 40;
    }
  } catch (err) {
    console.warn('[WebRTC] Playout delay hint not supported on this browser:', err);
  }
}

/**
 * Queries WebRTC stats for fps, actual bitrate, packet loss, and latency
 */
export async function collectStreamStats(
  peerConnection: RTCPeerConnection,
  lastStats?: { bytesReceived?: number; framesDecoded?: number; timestamp?: number }
): Promise<{
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
  bytesNow: number;
  framesNow: number;
  timestamp: number;
}> {
  const statsReport = await peerConnection.getStats();
  let fps = 0;
  let bitrateKbps = 0;
  let width = 0;
  let height = 0;
  let rttMs = 0;
  let packetLossPercent = 0;
  let jitterMs = 0;
  let encoder = '';
  let decoder = '';
  let droppedFrames = 0;
  let bytesNow = 0;
  let framesNow = 0;
  const now = Date.now();

  statsReport.forEach(report => {
    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      bytesNow = report.bytesReceived || 0;
      framesNow = report.framesDecoded || 0;
      droppedFrames = report.framesDropped || 0;
      jitterMs = Math.round((report.jitter || 0) * 1000);
      decoder = report.decoderImplementation || '';

      const totalPackets = (report.packetsReceived || 0) + (report.packetsLost || 0);
      if (totalPackets > 0) {
        packetLossPercent = Math.min(100, Math.round(((report.packetsLost || 0) / totalPackets) * 1000) / 10);
      }

      if (lastStats && lastStats.timestamp && lastStats.bytesReceived !== undefined) {
        const timeDiffSec = (now - lastStats.timestamp) / 1000;
        if (timeDiffSec > 0) {
          const bytesDiff = bytesNow - lastStats.bytesReceived;
          bitrateKbps = Math.round((bytesDiff * 8) / (timeDiffSec * 1000));

          if (lastStats.framesDecoded !== undefined) {
            const framesDiff = framesNow - lastStats.framesDecoded;
            fps = Math.round(framesDiff / timeDiffSec);
          }
        }
      }

      if (report.frameWidth) width = report.frameWidth;
      if (report.frameHeight) height = report.frameHeight;
      if (report.framesPerSecond) fps = Math.round(report.framesPerSecond);
    }

    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      encoder = report.encoderImplementation || '';
      if (report.frameWidth) width = report.frameWidth;
      if (report.frameHeight) height = report.frameHeight;
      if (report.framesPerSecond) fps = Math.round(report.framesPerSecond);
    }

    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      rttMs = Math.round((report.currentRoundTripTime || 0) * 1000);
    }
  });

  return {
    fps,
    bitrateKbps,
    width,
    height,
    rttMs,
    packetLossPercent,
    jitterMs,
    encoder,
    decoder,
    droppedFrames,
    bytesNow,
    framesNow,
    timestamp: now
  };
}
