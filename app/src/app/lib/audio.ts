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
 * via rAF and can be stopped early. An optional `bed` (e.g. the dialogue-free
 * background stem) plays underneath for the same window, so auditioning a take
 * sounds like the final dub.
 */
export function playSegment(
  buffer: AudioBuffer,
  opts: {
    startMs?: number;
    endMs?: number;
    bed?: { buffer: AudioBuffer; offsetMs: number };
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

  let bedSrc: AudioBufferSourceNode | null = null;
  if (opts.bed) {
    bedSrc = ac.createBufferSource();
    bedSrc.buffer = opts.bed.buffer;
    bedSrc.connect(ac.destination);
    bedSrc.start(t0, opts.bed.offsetMs / 1000, durSec);
  }

  let raf = 0;
  let done = false;
  const tick = () => {
    const p = Math.min(1, (ac.currentTime - t0) / durSec);
    opts.onProgress?.(p);
    if (p < 1 && !done) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const stopBed = () => {
    try {
      bedSrc?.stop();
    } catch {
      /* already stopped */
    }
  };

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    stopBed();
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
    // ~43ms window at 48kHz: level() is polled every 50ms, so max-abs over
    // this window ≈ the true peak of the interval (512 saw only ~11ms and
    // missed most transients, making the live waveform disagree with the
    // decoded take's).
    this.analyser.fftSize = 2048;
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
 * Screening mixer: schedules the scene audio + every line (player take, with
 * the original dialogue as fallback) against video playback starting from t=0.
 *
 * Two modes:
 * - With a background stem (scene audio minus dialogue): the background plays
 *   for the whole scene, takes land on top at their line times. Unrecorded
 *   lines fall back to the vocals stem (dialogue only) when present, else the
 *   full original segment.
 * - Without one: the original plays only in the gaps between lines, so takes
 *   never fight the real dialogue.
 */
export function scheduleScreening(opts: {
  original: AudioBuffer;
  background?: AudioBuffer;
  vocals?: AudioBuffer;
  durationMs: number;
  lines: { startMs: number; endMs: number; take?: AudioBuffer }[];
  leadInSec?: number;
  /** Where to send the mix. Defaults to the speakers; pass a
   *  MediaStreamAudioDestinationNode to capture it for export. */
  out?: AudioNode;
}): { startTime: number; stop: () => void } {
  const ac = audioCtx();
  const out = opts.out ?? ac.destination;
  const t0 = ac.currentTime + (opts.leadInSec ?? 0.15);
  const sources: AudioBufferSourceNode[] = [];

  const playSlice = (buffer: AudioBuffer, atMs: number, fromMs: number, toMs: number) => {
    if (toMs <= fromMs) return;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.start(t0 + atMs / 1000, fromMs / 1000, (toMs - fromMs) / 1000);
    sources.push(src);
  };

  if (opts.background) {
    // Dialogue-free bed under everything
    playSlice(opts.background, 0, 0, opts.durationMs);
  } else {
    // No stem: original audio in the gaps around lines only
    const sorted = [...opts.lines].sort((a, b) => a.startMs - b.startMs);
    let cursor = 0;
    for (const line of sorted) {
      playSlice(opts.original, cursor, cursor, line.startMs);
      cursor = Math.max(cursor, line.endMs);
    }
    playSlice(opts.original, cursor, cursor, opts.durationMs);
  }

  for (const line of opts.lines) {
    if (line.take) {
      const src = ac.createBufferSource();
      src.buffer = line.take;
      src.connect(out);
      src.start(t0 + line.startMs / 1000);
      sources.push(src);
    } else {
      // Unrecorded line: dialogue-only stem if we have it, else the full mix
      playSlice(opts.vocals ?? opts.original, line.startMs, line.startMs, line.endMs);
    }
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
