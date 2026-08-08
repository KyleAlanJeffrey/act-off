import { useEffect, useRef } from "react";

type Props = {
  buffer: AudioBuffer | null;
  /** Slice of the buffer to render, in ms. Defaults to the whole buffer. */
  startMs?: number;
  endMs?: number;
  /** Playback progress 0..1 across the rendered slice. */
  progress?: number;
  color: string;
  dimColor: string;
  className?: string;
};

const BAR_COUNT = 72;

/** Neon bar-style waveform rendered from an AudioBuffer slice. */
export default function Waveform({
  buffer,
  startMs,
  endMs,
  progress = 0,
  color,
  dimColor,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<number[] | null>(null);

  useEffect(() => {
    peaksRef.current = buffer ? computePeaks(buffer, startMs, endMs) : null;
    draw(canvasRef.current, peaksRef.current, progress, color, dimColor);
  }, [buffer, startMs, endMs]);

  useEffect(() => {
    draw(canvasRef.current, peaksRef.current, progress, color, dimColor);
  }, [progress, color, dimColor]);

  return (
    <canvas
      ref={canvasRef}
      width={720}
      height={96}
      className={className ?? "w-full h-16"}
    />
  );
}

function computePeaks(buffer: AudioBuffer, startMs?: number, endMs?: number): number[] {
  const data = buffer.getChannelData(0);
  const from = Math.floor(((startMs ?? 0) / 1000) * buffer.sampleRate);
  const to = Math.min(
    data.length,
    Math.floor(((endMs ?? buffer.duration * 1000) / 1000) * buffer.sampleRate)
  );
  const windowSize = Math.max(1, Math.floor((to - from) / BAR_COUNT));
  const peaks: number[] = [];
  for (let b = 0; b < BAR_COUNT; b++) {
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

function draw(
  canvas: HTMLCanvasElement | null,
  peaks: number[] | null,
  progress: number,
  color: string,
  dimColor: string
) {
  if (!canvas) return;
  const g = canvas.getContext("2d");
  if (!g) return;
  const { width: W, height: H } = canvas;
  g.clearRect(0, 0, W, H);

  const gap = 3;
  const barW = W / BAR_COUNT - gap;
  for (let i = 0; i < BAR_COUNT; i++) {
    const p = peaks ? peaks[i] : 0.08;
    const h = Math.max(4, p * (H - 8));
    const x = i * (barW + gap);
    const played = (i + 0.5) / BAR_COUNT <= progress;
    g.fillStyle = played ? color : dimColor;
    g.shadowColor = played ? color : "transparent";
    g.shadowBlur = played ? 8 : 0;
    roundRect(g, x, (H - h) / 2, barW, h, barW / 2);
  }
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}
