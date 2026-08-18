import { useEffect, useMemo, useRef } from "react";

type Props = {
  /** The scene's original audio; the line's slice is rendered. */
  original: AudioBuffer;
  startMs: number;
  endMs: number;
  /** The player's recorded take (full buffer), drawn mirrored below. */
  take?: AudioBuffer | null;
  /** Live mic levels (0..1, one sample per `liveSampleMs`) while recording. */
  liveLevels?: number[] | null;
  liveSampleMs?: number;
  /** Playhead position in ms on the shared axis, or null to hide. */
  playheadMs?: number | null;
  className?: string;
};

const BARS = 96;
const ORIGINAL_COLOR = "rgba(0, 238, 252, 0.75)";
const ORIGINAL_DIM = "rgba(0, 238, 252, 0.28)";
const TAKE_COLOR = "rgba(236, 178, 255, 0.95)";
const LIVE_COLOR = "rgba(255, 92, 92, 0.95)";
const CENTER_LINE = "rgba(157, 139, 160, 0.4)";

/**
 * One shared lane: the original line's waveform on the top half, your take
 * (or the live recording) mirrored on the bottom half, same time axis.
 */
export default function Waveform({
  original,
  startMs,
  endMs,
  take,
  liveLevels,
  liveSampleMs = 50,
  playheadMs = null,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const lineDurMs = endMs - startMs;
  const takeDurMs = take ? take.duration * 1000 : 0;
  const liveDurMs = liveLevels ? liveLevels.length * liveSampleMs : 0;
  const axisMs = Math.max(lineDurMs, takeDurMs, liveDurMs, 1);

  const originalPeaks = useMemo(
    () => bufferPeaks(original, startMs, endMs, BARS * (lineDurMs / axisMs)),
    [original, startMs, endMs, axisMs]
  );
  const takePeaks = useMemo(
    () => (take ? bufferPeaks(take, 0, takeDurMs, BARS * (takeDurMs / axisMs)) : null),
    [take, takeDurMs, axisMs]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const { width: W, height: H } = canvas;
    const mid = H / 2;
    const gap = 2;
    const barW = W / BARS - gap;
    g.clearRect(0, 0, W, H);

    // center line
    g.fillStyle = CENTER_LINE;
    g.fillRect(0, mid - 0.5, W, 1);

    const playheadX = playheadMs === null ? null : (playheadMs / axisMs) * W;

    // top half: original
    for (let i = 0; i < originalPeaks.length; i++) {
      const x = i * (barW + gap);
      const played = playheadX !== null && x <= playheadX;
      g.fillStyle = played ? ORIGINAL_COLOR : playheadX !== null ? ORIGINAL_DIM : ORIGINAL_COLOR;
      const h = Math.max(2, originalPeaks[i] * (mid - 6));
      g.beginPath();
      g.roundRect(x, mid - 2 - h, barW, h, barW / 2);
      g.fill();
    }

    // bottom half: the take, or live recording levels
    if (takePeaks) {
      g.fillStyle = TAKE_COLOR;
      for (let i = 0; i < takePeaks.length; i++) {
        const x = i * (barW + gap);
        const h = Math.max(2, takePeaks[i] * (mid - 6));
        g.beginPath();
        g.roundRect(x, mid + 2, barW, h, barW / 2);
        g.fill();
      }
    } else if (liveLevels && liveLevels.length > 0) {
      g.fillStyle = LIVE_COLOR;
      const samplesPerBar = Math.max(1, Math.ceil((axisMs / BARS) / liveSampleMs));
      const barCount = Math.ceil(liveLevels.length / samplesPerBar);
      for (let b = 0; b < barCount; b++) {
        let max = 0;
        for (let s = b * samplesPerBar; s < Math.min((b + 1) * samplesPerBar, liveLevels.length); s++) {
          max = Math.max(max, liveLevels[s]);
        }
        const x = b * (barW + gap);
        const h = Math.max(2, max * (mid - 6));
        g.beginPath();
        g.roundRect(x, mid + 2, barW, h, barW / 2);
        g.fill();
      }
    }

    // playhead
    if (playheadX !== null) {
      g.fillStyle = "#ffffff";
      g.shadowColor = "#00eefc";
      g.shadowBlur = 10;
      g.fillRect(playheadX - 1, 2, 2, H - 4);
      g.shadowBlur = 0;
    }
  }, [originalPeaks, takePeaks, liveLevels, playheadMs, axisMs, liveSampleMs]);

  return (
    <canvas ref={canvasRef} width={960} height={128} className={className ?? "w-full h-24"} />
  );
}

function bufferPeaks(
  buffer: AudioBuffer,
  startMs: number,
  endMs: number,
  barCountF: number
): number[] {
  const barCount = Math.max(1, Math.round(barCountF));
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor((startMs / 1000) * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor((endMs / 1000) * buffer.sampleRate));
  const windowSize = Math.max(1, Math.floor((to - from) / barCount));
  const peaks: number[] = [];
  for (let b = 0; b < barCount; b++) {
    let max = 0;
    const s = from + b * windowSize;
    for (let i = s; i < Math.min(s + windowSize, to); i += 4) {
      max = Math.max(max, Math.abs(data[i]));
    }
    peaks.push(max);
  }
  const norm = Math.max(0.25, ...peaks);
  return peaks.map((p) => p / norm);
}
