import { useEffect, useRef, useState } from "react";
import type { DraftLine } from "../lib/subtitles";
import { themeColor, withAlpha } from "../lib/theme";

export type Peaks = { bins: Float32Array; binMs: number };

export type Trim = { startMs: number; endMs: number };

type Props = {
  peaks: Peaks | null;
  durationMs: number;
  playheadMs: number;
  lines: DraftLine[];
  sel: number;
  viewStartMs: number;
  zoomMs: number;
  trim: Trim | null;
  charColor: (id: string) => string;
  onSeek: (ms: number) => void;
  onSelect: (i: number) => void;
  onChangeLine: (i: number, patch: Partial<DraftLine>) => void;
  onChangeTrim: (trim: Trim) => void;
  onView: (viewStartMs: number, zoomMs?: number) => void;
};

type Drag =
  | { kind: "scrub" }
  | { kind: "edge"; line: number; edge: "startMs" | "endMs" }
  | { kind: "move"; line: number; grabMs: number }
  | { kind: "trim"; edge: "startMs" | "endMs" };

const EDGE_PX = 7;
const MIN_LINE_MS = 100;

/**
 * Overlapping lines (characters singing/talking at once) stack into lanes so
 * each stays visible and draggable. Greedy interval coloring: earliest start
 * takes the first lane whose previous occupant has ended.
 */
function computeLanes(lines: DraftLine[]): { lane: number[]; count: number } {
  const order = lines
    .map((_, i) => i)
    .sort((a, b) => lines[a].startMs - lines[b].startMs || a - b);
  const lane = new Array<number>(lines.length).fill(0);
  const laneEnds: number[] = [];
  for (const i of order) {
    let k = laneEnds.findIndex((end) => lines[i].startMs >= end);
    if (k === -1) k = laneEnds.push(-Infinity) - 1;
    lane[i] = k;
    laneEnds[k] = lines[i].endMs;
  }
  return { lane, count: Math.max(1, laneEnds.length) };
}

/**
 * The precision timeline: a zoomed window of the clip's audio waveform with
 * the lines drawn on top. Drag a line's edge to retime it against the audio,
 * drag the selected line's body to move it, drag empty space to scrub,
 * wheel to zoom (pinch/ctrl) or pan.
 */
export default function EditorTimeline({
  peaks,
  durationMs,
  playheadMs,
  lines,
  sel,
  viewStartMs,
  zoomMs,
  trim,
  charColor,
  onSeek,
  onSelect,
  onChangeLine,
  onChangeTrim,
  onView,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // The first draw can land before layout (clientWidth 0) — redraw on resize
  const [sizeTick, setSizeTick] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  // Extras that must be readable inside pointer handlers without re-binding
  const stateRef = useRef({ viewStartMs, zoomMs, lines, sel, durationMs, trim });
  stateRef.current = { viewStartMs, zoomMs, lines, sel, durationMs, trim };

  // ---- Drawing ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Palette from the Tailwind theme tokens — canvas and CSS share one source
    const ink = themeColor(canvas, "--color-on-surface", "#e2dfff");
    const wave = themeColor(canvas, "--color-secondary-container", "#00eefc");
    const dim = themeColor(canvas, "--color-surface-container-lowest", "#0a0a2a");
    const gold = themeColor(canvas, "--color-gold", "#ffd54a");
    const playheadColor = themeColor(canvas, "--color-error", "#ffb4ab");

    const viewEnd = viewStartMs + zoomMs;
    const xOf = (ms: number) => ((ms - viewStartMs) / zoomMs) * W;

    // Waveform (empty bins = the clip had no decodable audio; draw nothing).
    // One column per CSS pixel, taking the loudest bin under it — stays a
    // crisp waveform at any zoom instead of smearing into a solid block.
    if (peaks && peaks.bins.length > 0) {
      ctx.fillStyle = withAlpha(wave, 0.5);
      const mid = H / 2;
      for (let x = 0; x < W; x++) {
        const b0 = Math.max(0, Math.floor((viewStartMs + (x / W) * zoomMs) / peaks.binMs));
        const b1 = Math.min(
          peaks.bins.length - 1,
          Math.max(b0, Math.floor((viewStartMs + ((x + 1) / W) * zoomMs) / peaks.binMs))
        );
        if (b0 > b1 || b0 >= peaks.bins.length) continue;
        let peak = 0;
        for (let b = b0; b <= b1; b++) if (peaks.bins[b] > peak) peak = peaks.bins[b];
        const h = Math.max(1, peak * (H * 0.82));
        ctx.fillRect(x, mid - h / 2, 1, h);
      }
    } else if (!peaks) {
      ctx.fillStyle = withAlpha(ink, 0.25);
      ctx.font = "11px Quicksand, sans-serif";
      ctx.fillText("decoding audio…", 10, H / 2 + 4);
    }

    // Time ticks — pick a step that keeps labels ~90px apart
    const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const step = steps.find((s) => (s / zoomMs) * W >= 90) ?? 60000;
    ctx.font = "10px Quicksand, sans-serif";
    for (let t = Math.ceil(viewStartMs / step) * step; t <= viewEnd; t += step) {
      const x = xOf(t);
      ctx.fillStyle = withAlpha(ink, 0.18);
      ctx.fillRect(x, 0, 1, H);
      ctx.fillStyle = withAlpha(ink, 0.5);
      const secs = t / 1000;
      const label = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}${step < 1000 ? `.${Math.round((secs % 1) * 10)}` : ""}`;
      ctx.fillText(label, x + 3, 11);
    }

    // Lines — overlapping ones stack into lanes so both stay visible
    const { lane, count } = computeLanes(lines);
    const bandH = (H - 6) / count;
    lines.forEach((l, i) => {
      if (l.endMs < viewStartMs || l.startMs > viewEnd) return;
      const x1 = xOf(l.startMs);
      const x2 = xOf(l.endMs);
      const y = 3 + lane[i] * bandH;
      const bh = bandH - (count > 1 ? 2 : 0);
      const color = charColor(l.characterId);
      const active = i === sel;
      ctx.fillStyle = color + (active ? "55" : "2e");
      ctx.fillRect(x1, y, x2 - x1, bh);
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x1, y, x2 - x1, bh);
      // Edge handles on the selected line
      if (active) {
        ctx.fillStyle = ink;
        ctx.fillRect(x1 - 1.5, y, 3, bh);
        ctx.fillRect(x2 - 1.5, y, 3, bh);
      }
      // Labels only where they have room — at low zoom they just collide
      if (x2 - x1 > 44 && bh > 14) {
        ctx.fillStyle = active ? ink : withAlpha(ink, 0.7);
        ctx.font = "700 10px Quicksand, sans-serif";
        const label = `${i + 1}. ${l.text}`;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1 + 3, y, Math.max(0, x2 - x1 - 6), bh);
        ctx.clip();
        ctx.fillText(label, x1 + 5, y + bh - 6);
        ctx.restore();
      }
    });

    // Trim: dim everything outside the kept range, gold handles at the edges
    if (trim) {
      ctx.fillStyle = withAlpha(dim, 0.62);
      const tx1 = xOf(trim.startMs);
      const tx2 = xOf(trim.endMs);
      if (tx1 > 0) ctx.fillRect(0, 0, Math.min(tx1, W), H);
      if (tx2 < W) ctx.fillRect(Math.max(0, tx2), 0, W - tx2, H);
      ctx.fillStyle = gold;
      for (const tx of [tx1, tx2]) {
        if (tx < -3 || tx > W + 3) continue;
        ctx.fillRect(tx - 1.5, 0, 3, H);
        ctx.beginPath();
        ctx.moveTo(tx - 6, H);
        ctx.lineTo(tx + 6, H);
        ctx.lineTo(tx, H - 8);
        ctx.fill();
      }
    }

    // Playhead
    const px = xOf(playheadMs);
    if (px >= 0 && px <= W) {
      ctx.fillStyle = playheadColor;
      ctx.fillRect(px - 0.5, 0, 1.5, H);
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 7);
      ctx.fill();
    }
  }, [peaks, durationMs, playheadMs, lines, sel, viewStartMs, zoomMs, trim, charColor, sizeTick]);

  // ---- Interaction ----
  const msAt = (clientX: number) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const { viewStartMs: vs, zoomMs: z } = stateRef.current;
    return vs + ((clientX - r.left) / r.width) * z;
  };
  // Vertical position as a 0..1 fraction of the lane strip, for stacked lines
  const yFracAt = (clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - r.top - 3) / Math.max(1, r.height - 6)));
  };
  const pxPerMs = () => {
    const canvas = canvasRef.current!;
    return canvas.getBoundingClientRect().width / stateRef.current.zoomMs;
  };

  const hitTest = (ms: number, yFrac: number): Drag => {
    const { lines: ls, sel: s, trim: t } = stateRef.current;
    const tolMs = EDGE_PX / pxPerMs();
    const { lane, count } = computeLanes(ls);
    const inBand = (i: number) => yFrac >= lane[i] / count && yFrac <= (lane[i] + 1) / count;
    // Selected line's edges win, then any line's edges — within its own lane,
    // so duplicated (same-window) lines stay individually grabbable
    const order = s >= 0 ? [s, ...ls.map((_, i) => i).filter((i) => i !== s)] : ls.map((_, i) => i);
    for (const i of order) {
      if (!inBand(i)) continue;
      if (Math.abs(ls[i].startMs - ms) < tolMs) return { kind: "edge", line: i, edge: "startMs" };
      if (Math.abs(ls[i].endMs - ms) < tolMs) return { kind: "edge", line: i, edge: "endMs" };
    }
    if (t) {
      if (Math.abs(t.startMs - ms) < tolMs) return { kind: "trim", edge: "startMs" };
      if (Math.abs(t.endMs - ms) < tolMs) return { kind: "trim", edge: "endMs" };
    }
    for (const i of order) {
      if (inBand(i) && ms >= ls[i].startMs && ms <= ls[i].endMs) {
        return i === s ? { kind: "move", line: i, grabMs: ms - ls[i].startMs } : { kind: "scrub" };
      }
    }
    return { kind: "scrub" };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events have no active pointer — dragging still works via bubbling
    }
    const ms = msAt(e.clientX);
    const yFrac = yFracAt(e.clientY);
    const { lines: ls, sel: s } = stateRef.current;
    const hit = hitTest(ms, yFrac);
    // Clicking an unselected line selects it (and scrubs there)
    const { lane, count } = computeLanes(ls);
    const under = ls.findIndex(
      (l, i) =>
        ms >= l.startMs && ms <= l.endMs && yFrac >= lane[i] / count && yFrac <= (lane[i] + 1) / count
    );
    if (hit.kind === "scrub" && under !== -1 && under !== s) onSelect(under);
    if (hit.kind === "edge" && hit.line !== s) onSelect(hit.line);
    dragRef.current = hit;
    if (hit.kind === "scrub") onSeek(ms);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const ms = msAt(e.clientX);
    const drag = dragRef.current;
    if (!drag) {
      const hit = hitTest(ms, yFracAt(e.clientY));
      canvas.style.cursor =
        hit.kind === "edge" || hit.kind === "trim"
          ? "ew-resize"
          : hit.kind === "move"
            ? "grab"
            : "crosshair";
      return;
    }
    const { lines: ls, durationMs: dur, trim: t } = stateRef.current;
    const clamp = (v: number) => Math.max(0, Math.min(dur, v));
    if (drag.kind === "scrub") {
      onSeek(clamp(ms));
    } else if (drag.kind === "trim") {
      if (!t) return;
      if (drag.edge === "startMs") {
        onChangeTrim({ ...t, startMs: Math.round(clamp(Math.min(ms, t.endMs - 1000))) });
      } else {
        onChangeTrim({ ...t, endMs: Math.round(clamp(Math.max(ms, t.startMs + 1000))) });
      }
    } else if (drag.kind === "edge") {
      const l = ls[drag.line];
      if (drag.edge === "startMs") {
        onChangeLine(drag.line, { startMs: Math.round(clamp(Math.min(ms, l.endMs - MIN_LINE_MS))) });
      } else {
        onChangeLine(drag.line, { endMs: Math.round(clamp(Math.max(ms, l.startMs + MIN_LINE_MS))) });
      }
    } else {
      const l = ls[drag.line];
      const len = l.endMs - l.startMs;
      const start = Math.round(Math.max(0, Math.min(dur - len, ms - drag.grabMs)));
      onChangeLine(drag.line, { startMs: start, endMs: start + len });
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    // Park the playhead on the edge that was just dragged for instant audition
    if (drag?.kind === "edge") {
      const l = stateRef.current.lines[drag.line];
      if (l) onSeek(drag.edge === "startMs" ? l.startMs : Math.max(0, l.endMs - 800));
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { viewStartMs: vs, zoomMs: z, durationMs: dur } = stateRef.current;
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // Zoom around the cursor
      const anchor = msAt(e.clientX);
      const factor = Math.exp(e.deltaY * 0.002);
      const newZoom = Math.min(dur || 60000, Math.max(1500, z * factor));
      const frac = (anchor - vs) / z;
      onView(Math.max(0, anchor - frac * newZoom), newZoom);
    } else {
      onView(Math.max(0, Math.min((dur || 0) - z, vs + e.deltaX * (z / 1000))), z);
    }
  };
  // React attaches onWheel passively, so its preventDefault can't stop the
  // page from scrolling — a native non-passive listener locks scroll to the
  // timeline while the cursor is over it.
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => onWheelRef.current(e);
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-28 rounded-md border-2 border-outline-variant bg-surface-container-lowest touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
