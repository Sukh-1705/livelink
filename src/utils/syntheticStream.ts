/**
 * Generates a synthetic broadcast test pattern stream at exact resolution and framerate
 * with frame counters, millisecond timecode, dynamic motion, and audio sync tone.
 */
export function createSyntheticStream(
  label = 'Cam Synthetic',
  width = 1920,
  height = 1080,
  targetFps = 60
): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Web Audio tone generator
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const audioDest = audioCtx.createMediaStreamDestination();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1 kHz sync beep
  gain.gain.setValueAtTime(0, audioCtx.currentTime);

  osc.connect(gain);
  gain.connect(audioDest);
  osc.start();

  let frameCount = 0;
  let isRunning = true;
  let ballX = 200;
  let ballY = 200;
  let vx = 6;
  let vy = 4;
  let lastSecond = -1;

  const startTime = performance.now();

  function draw() {
    if (!isRunning) return;

    const now = performance.now();
    const elapsed = now - startTime;
    const date = new Date();
    frameCount++;

    // Background gradient (Dark studio broadcast grid)
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#09090b');
    grad.addColorStop(1, '#18181b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle alignment grid
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    const gridSize = 80;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Top Header Bar
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, width, 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.fillText(`LIVELINK BROADCAST PATTERN  |  ${label.toUpperCase()}`, 30, 34);

    // Standard SMPTE-style Color Bar Strip
    const barWidth = width / 8;
    const colors = ['#ffffff', '#facc15', '#06b6d4', '#22c55e', '#ec4899', '#ef4444', '#3b82f6', '#000000'];
    const barY = 60;
    const barHeight = 80;
    for (let i = 0; i < colors.length; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * barWidth, barY, barWidth, barHeight);
    }

    // Main Center Timecode & Frame Display
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(width / 2 - 400, height / 2 - 140, 800, 240);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.strokeRect(width / 2 - 400, height / 2 - 140, 800, 240);

    // Formatted timecode (HH:MM:SS:FF)
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const frames = String(Math.floor((elapsed % 1000) / (1000 / targetFps))).padStart(2, '0');
    const millis = String(Math.floor(elapsed % 1000)).padStart(3, '0');

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 72px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${hours}:${minutes}:${seconds}:${frames}`, width / 2, height / 2 - 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 28px "JetBrains Mono", monospace';
    ctx.fillText(`Frame #${frameCount}  •  ${width}x${height} @ ${targetFps}fps  •  +${millis}ms`, width / 2, height / 2 + 50);

    // Bouncing 60fps Target Wheel (reveals any frame drop or jitter)
    ballX += vx;
    ballY += vy;
    const radius = 50;

    if (ballX + radius > width || ballX - radius < 0) vx = -vx;
    if (ballY + radius > height - 100 || ballY - radius < 150) vy = -vy;

    ctx.beginPath();
    ctx.arc(ballX, ballY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Crosshairs on ball
    ctx.beginPath();
    ctx.moveTo(ballX - radius, ballY);
    ctx.lineTo(ballX + radius, ballY);
    ctx.moveTo(ballX, ballY - radius);
    ctx.lineTo(ballX, ballY + radius);
    ctx.stroke();

    // Dynamic high-entropy noise box in bottom right (forces encoder bitrate work)
    const noiseW = 200;
    const noiseH = 100;
    const noiseX = width - noiseW - 30;
    const noiseY = height - noiseH - 30;
    const imgData = ctx.createImageData(noiseW, noiseH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(imgData, noiseX, noiseY);
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(noiseX, noiseY, noiseW, noiseH);

    // Audio Sync Beep (50ms pulse on each whole second)
    const currentSec = date.getSeconds();
    if (currentSec !== lastSecond) {
      lastSecond = currentSec;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);

      // Flash visual sync indicator
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(width / 2 - 50, height / 2 + 70, 100, 20);
    }

    ctx.textAlign = 'left';
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);

  // Capture canvas video track at exact targetFps
  const canvasStream = canvas.captureStream(targetFps);
  const audioTrack = audioDest.stream.getAudioTracks()[0];

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    audioTrack
  ]);

  return {
    stream: combinedStream,
    stop: () => {
      isRunning = false;
      osc.stop();
      audioCtx.close();
      combinedStream.getTracks().forEach(t => t.stop());
    }
  };
}
