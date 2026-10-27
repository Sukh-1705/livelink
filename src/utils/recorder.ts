/**
 * LiveLink ISO Multi-Stream and Single-Stream Recorder
 */
export class StreamRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  public isRecording = false;
  public startTime = 0;
  public duration = 0;
  private timerInterval: any = null;

  constructor(
    public streamId: string,
    public label: string,
    public onStatusChange?: (isRecording: boolean, durationSec: number) => void
  ) {}

  start(stream: MediaStream, bitrateBps = 25000000): boolean {
    if (this.isRecording) return false;

    // Pick best supported MIME type
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/webm'
    ];

    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    try {
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMime || undefined,
        videoBitsPerSecond: bitrateBps
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecording();
      };

      this.mediaRecorder.start(1000); // 1-second chunks
      this.isRecording = true;
      this.startTime = Date.now();

      this.timerInterval = setInterval(() => {
        this.duration = Math.floor((Date.now() - this.startTime) / 1000);
        if (this.onStatusChange) {
          this.onStatusChange(true, this.duration);
        }
      }, 1000);

      if (this.onStatusChange) {
        this.onStatusChange(true, 0);
      }

      console.log(`[Recorder] Started recording "${this.label}" (${selectedMime}) @ ${bitrateBps / 1000000} Mbps`);
      return true;
    } catch (err) {
      console.error('[Recorder] Failed to start recorder:', err);
      return false;
    }
  }

  stop() {
    if (!this.isRecording || !this.mediaRecorder) return;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.isRecording = false;
    this.mediaRecorder.stop();

    if (this.onStatusChange) {
      this.onStatusChange(false, this.duration);
    }
  }

  private saveRecording() {
    if (this.chunks.length === 0) return;

    const mime = this.mediaRecorder?.mimeType || 'video/webm';
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(this.chunks, { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const timeStr = new Date(this.startTime).toISOString().replace(/[:.]/g, '-');
    a.download = `LiveLink_${this.label.replace(/\s+/g, '_')}_${timeStr}.${ext}`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

export class IsoRecorderManager {
  private recorders = new Map<string, StreamRecorder>();
  public isRecordingAll = false;
  public totalDuration = 0;
  private interval: any = null;

  startAll(streams: { id: string; label: string; mediaStream: MediaStream }[], bitrateBps = 25000000) {
    if (this.isRecordingAll) return;
    this.recorders.clear();

    const startTimestamp = Date.now();
    for (const s of streams) {
      const rec = new StreamRecorder(s.id, s.label);
      rec.start(s.mediaStream, bitrateBps);
      this.recorders.set(s.id, rec);
    }

    this.isRecordingAll = true;
    this.totalDuration = 0;

    this.interval = setInterval(() => {
      this.totalDuration = Math.floor((Date.now() - startTimestamp) / 1000);
    }, 1000);
  }

  stopAll() {
    if (!this.isRecordingAll) return;

    for (const rec of this.recorders.values()) {
      rec.stop();
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRecordingAll = false;
    this.recorders.clear();
  }
}
