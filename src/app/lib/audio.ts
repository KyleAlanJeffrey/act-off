let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export async function fetchAudioBuffer(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return audioCtx().decodeAudioData(await res.arrayBuffer());
}

export async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  return audioCtx().decodeAudioData(await blob.arrayBuffer());
}

/**
 * Plays one segment of a buffer. Returns a handle that reports progress (0..1)
 * via rAF and can be stopped early.
 */
export function playSegment(
  buffer: AudioBuffer,
  opts: {
    startMs?: number;
    endMs?: number;
    onProgress?: (p: number) => void;
    onEnded?: () => void;
  } = {}
): { stop: () => void } {
  const ac = audioCtx();
  const startSec = (opts.startMs ?? 0) / 1000;
  const endSec = (opts.endMs ?? buffer.duration * 1000) / 1000;
  const durSec = Math.max(0.01, endSec - startSec);

  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(ac.destination);
  const t0 = ac.currentTime;
  src.start(t0, startSec, durSec);

  let raf = 0;
  let done = false;
  const tick = () => {
    const p = Math.min(1, (ac.currentTime - t0) / durSec);
    opts.onProgress?.(p);
    if (p < 1 && !done) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    opts.onProgress?.(1);
    opts.onEnded?.();
  };
  src.onended = finish;

  return {
    stop: () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      finish();
    },
  };
}

/** Microphone session: one getUserMedia stream reused for all takes + level metering. */
export class MicSession {
  private stream: MediaStream;
  private analyser: AnalyserNode;
  private levelData: Uint8Array<ArrayBuffer>;
  private recorder: MediaRecorder | null = null;

  private constructor(stream: MediaStream) {
    this.stream = stream;
    const ac = audioCtx();
    const src = ac.createMediaStreamSource(stream);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 512;
    src.connect(this.analyser);
    this.levelData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  static async open(): Promise<MicSession> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return new MicSession(stream);
  }

  /** 0..1 rough input level for meters. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.levelData);
    let max = 0;
    for (const v of this.levelData) max = Math.max(max, Math.abs(v - 128));
    return Math.min(1, max / 100);
  }

  startRecording(): void {
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/mp4";
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.start();
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) return reject(new Error("not recording"));
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
      rec.onerror = () => reject(new Error("recorder error"));
      rec.stop();
      this.recorder = null;
    });
  }

  close(): void {
    for (const track of this.stream.getTracks()) track.stop();
  }
}

/**
 * Screening mixer: schedules every line's audio (player take, or the original
 * segment as fallback) against video playback starting from t=0.
 */
export function scheduleScreening(
  original: AudioBuffer,
  lines: { startMs: number; endMs: number; take?: AudioBuffer }[],
  leadInSec = 0.15
): { startTime: number; stop: () => void } {
  const ac = audioCtx();
  const t0 = ac.currentTime + leadInSec;
  const sources: AudioBufferSourceNode[] = [];

  for (const line of lines) {
    const src = ac.createBufferSource();
    if (line.take) {
      src.buffer = line.take;
      src.connect(ac.destination);
      src.start(t0 + line.startMs / 1000);
    } else {
      src.buffer = original;
      src.connect(ac.destination);
      src.start(
        t0 + line.startMs / 1000,
        line.startMs / 1000,
        (line.endMs - line.startMs) / 1000
      );
    }
    sources.push(src);
  }

  return {
    startTime: t0,
    stop: () => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already done */
        }
      }
    },
  };
}
