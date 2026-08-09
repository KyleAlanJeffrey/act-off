import { audioCtx, scheduleScreening } from "./audio";

export type ExportInput = {
  videoUrl: string;
  original: AudioBuffer;
  background?: AudioBuffer;
  vocals?: AudioBuffer;
  durationMs: number;
  lines: { startMs: number; endMs: number; take?: AudioBuffer }[];
  onProgress?: (p: number) => void;
};

/**
 * Renders the final cut to a video file by replaying the premiere into a
 * MediaRecorder: the clip's frames via captureStream(), the dub mix via a
 * MediaStreamAudioDestinationNode. Realtime — takes as long as the scene.
 * The tab must stay visible; browsers pause hidden video-only playback.
 */
export async function exportDub(input: ExportInput): Promise<Blob> {
  const ac = audioCtx();

  const video = document.createElement("video");
  video.src = input.videoUrl;
  video.muted = true;
  video.playsInline = true;
  // Attached + effectively invisible; display:none would stop frame delivery
  video.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;";
  document.body.appendChild(video);

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load the scene video."));
    });

    const audioOut = ac.createMediaStreamDestination();
    type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };
    const capture = (video as CapturableVideo).captureStream;
    if (!capture) throw new Error("This browser can't capture video for export.");
    const videoStream = capture.call(video);
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioOut.stream.getAudioTracks(),
    ]);

    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 2_500_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const recorded = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    });

    recorder.start(250);
    await video.play();
    // Schedule the mix once playback has actually begun, offset by however far
    // the video has already run so audio and picture line up.
    const alreadyMs = video.currentTime * 1000;
    const mix = scheduleScreening({
      original: input.original,
      background: input.background,
      vocals: input.vocals,
      durationMs: input.durationMs,
      lines: input.lines.map((l) => ({ ...l, startMs: l.startMs - alreadyMs, endMs: l.endMs - alreadyMs })),
      leadInSec: 0,
      out: audioOut,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        video.onended = () => resolve();
        let lastTime = -1;
        let lastAdvance = performance.now();
        // Interval, not rAF: rAF stops in hidden tabs, which is exactly the
        // case the stall guard needs to catch.
        const poll = setInterval(() => {
          if (video.ended || video.currentTime >= input.durationMs / 1000) {
            clearInterval(poll);
            return resolve();
          }
          if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;
            lastAdvance = performance.now();
            input.onProgress?.(
              Math.min(1, video.currentTime / (input.durationMs / 1000))
            );
          } else if (performance.now() - lastAdvance > 3000) {
            clearInterval(poll);
            reject(
              new Error(
                "Export stalled — the browser paused playback. Keep this tab visible and try again."
              )
            );
          }
        }, 100);
      });
    } finally {
      mix.stop();
      recorder.stop();
    }
    return await recorded;
  } finally {
    video.remove();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function dubFilename(sceneId: string, mimeType: string): string {
  return `act-off-${sceneId}.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
}

/** True when the browser can share files (Web Share API level 2). */
export function canShareFiles(): boolean {
  const probe = new File([""], "probe.webm", { type: "video/webm" });
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
}
