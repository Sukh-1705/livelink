import { SenderSettings, LatencyMode } from '../types';

/**
 * Custom SDP munger to enforce LAN/Cloud Max bitrates, prevent WebRTC GCC downscaling,
 * lock x-google min/start/max bitrates, and force high-quality stereo Opus.
 */
export function mungeSdp(sdp: string, bitrateKbps: number, stereo = true): string {
  let lines = sdp.split('\r\n');
  let inAudioSection = false;
  let inVideoSection = false;

  const maxBitrate = Math.max(25000, bitrateKbps);
  // Strict floor at 75% of maxBitrate stops Google Congestion Control from collapsing bitrate
  const minBitrate = Math.round(maxBitrate * 0.75);
  const startBitrate = Math.round(maxBitrate * 0.9);

  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.startsWith('m=audio')) {
      inAudioSection = true;
      inVideoSection = false;
    } else if (line.startsWith('m=video')) {
      inAudioSection = false;
      inVideoSection = true;
    } else if (line.startsWith('m=')) {
      inAudioSection = false;
      inVideoSection = false;
    }

    // Skip any existing bandwidth lines under video so we can inject strict directives
    if (inVideoSection && (line.startsWith('b=AS:') || line.startsWith('b=TIAS:'))) {
      continue;
    }

    // Set high-bitrate stereo Opus parameters
    if (inAudioSection && line.startsWith('a=fmtp:') && line.includes('opus')) {
      if (stereo && !line.includes('stereo=1')) {
        line = `${line};stereo=1;sprop-stereo=1;maxaveragebitrate=256000;cbr=1`;
      }
    }

    // Video codec format lines: inject strict min/start/max bitrates to avoid GCC downscaling
    if (inVideoSection && line.startsWith('a=fmtp:')) {
      if (!line.includes('x-google-min-bitrate')) {
        line = `${line};x-google-min-bitrate=${minBitrate};x-google-max-bitrate=${maxBitrate};x-google-start-bitrate=${startBitrate}`;
      }
    }

    newLines.push(line);

    // Immediately after m=video, inject b=AS (kbps) and b=TIAS (bps)
    if (line.startsWith('m=video')) {
      newLines.push(`b=AS:${maxBitrate}`);
      newLines.push(`b=TIAS:${maxBitrate * 1000}`);
    }
  }

  return newLines.join('\r\n');
}

/**
 * Applies strict encoding parameters to the video sender without renegotiating SDP.
 * Uses 'disabled' degradationPreference to turn off WebRTC quality downscaling entirely.
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

    const maxBps = Math.max(5000000, (settings.bitrateKbps || 30000) * 1000);
    const minBps = Math.round(maxBps * 0.75);

    for (let i = 0; i < params.encodings.length; i++) {
      params.encodings[i].maxBitrate = maxBps;
      params.encodings[i].minBitrate = minBps;
      params.encodings[i].maxFramerate = settings.frameRate || 60;
      params.encodings[i].scaleResolutionDownBy = 1.0;
      (params.encodings[i] as any).priority = 'high';
      (params.encodings[i] as any).networkPriority = 'high';
    }

    // W3C degradationPreference on RTCRtpSendParameters:
    // 'disabled': completely shuts off WebRTC QualityScaler (zero downscaling, zero framerate degradation)
    // Fallback to 'maintain-resolution' if older browser engine rejects 'disabled'
    const targetPref = settings.degradationPreference || (settings.strictQualityLock !== false ? 'disabled' : 'maintain-resolution');
    (params as any).degradationPreference = targetPref;

    if ('degradationPreference' in sender) {
      try { (sender as any).degradationPreference = targetPref; } catch (_) {}
    }

    try {
      await sender.setParameters(params);
      console.log(`[WebRTC] Applied strict parameters: ${settings.bitrateKbps} kbps max, ${settings.frameRate} fps, degradationPreference: ${targetPref}`);
    } catch (prefErr) {
      console.warn(`[WebRTC] setParameters with preference '${targetPref}' failed, trying 'maintain-resolution':`, prefErr);
      (params as any).degradationPreference = 'maintain-resolution';
      await sender.setParameters(params);
    }
  } catch (err) {
    console.warn('[WebRTC] Failed to set sender parameters:', err);
  }
}

/**
 * Scales and locks any source stream (even half-screen/arbitrary window sizes)
 * into an exact target resolution (e.g. 2560x1440 @ 60fps) with aspect-ratio preservation.
 */
export function createStrictCanvasStream(
  sourceStream: MediaStream,
  targetWidth: number,
  targetHeight: number,
  targetFps: number = 60
): { stream: MediaStream; stop: () => void } {
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) {
    return { stream: sourceStream, stop: () => {} };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const tempVideo = document.createElement('video');
  tempVideo.autoplay = true;
  tempVideo.muted = true;
  tempVideo.playsInline = true;
  tempVideo.srcObject = new MediaStream([videoTrack]);
  tempVideo.play().catch(() => {});

  let animFrameId: number;
  let isRunning = true;

  const render = () => {
    if (!isRunning) return;
    if (ctx && tempVideo.readyState >= 2) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const srcW = tempVideo.videoWidth || targetWidth;
      const srcH = tempVideo.videoHeight || targetHeight;
      const srcRatio = srcW / srcH;
      const targetRatio = targetWidth / targetHeight;

      let drawW = targetWidth;
      let drawH = targetHeight;
      let drawX = 0;
      let drawY = 0;

      if (srcRatio > targetRatio) {
        drawW = targetWidth;
        drawH = targetWidth / srcRatio;
        drawY = (targetHeight - drawH) / 2;
      } else {
        drawH = targetHeight;
        drawW = targetHeight * srcRatio;
        drawX = (targetWidth - drawW) / 2;
      }

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(tempVideo, drawX, drawY, drawW, drawH);
    }

    if ('requestVideoFrameCallback' in tempVideo) {
      (tempVideo as any).requestVideoFrameCallback(render);
    } else {
      animFrameId = requestAnimationFrame(render);
    }
  };

  if ('requestVideoFrameCallback' in tempVideo) {
    (tempVideo as any).requestVideoFrameCallback(render);
  } else {
    animFrameId = requestAnimationFrame(render);
  }

  const canvasStream = canvas.captureStream(targetFps);
  const outVideoTrack = canvasStream.getVideoTracks()[0];
  if (outVideoTrack) {
    (outVideoTrack as any).contentHint = 'detail';
  }

  sourceStream.getAudioTracks().forEach(a => canvasStream.addTrack(a));

  const stop = () => {
    isRunning = false;
    cancelAnimationFrame(animFrameId);
    tempVideo.pause();
    tempVideo.srcObject = null;
    canvasStream.getTracks().forEach(t => t.stop());
  };

  return { stream: canvasStream, stop };
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
