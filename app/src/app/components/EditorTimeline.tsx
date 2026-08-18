import { useEffect, useRef } from "react";
import type { DraftLine } from "../lib/subtitles";

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

    const viewEnd = viewStartMs + zoomMs;
    const xOf = (ms: number) => ((ms - viewStartMs) / zoomMs) * W;

    // Waveform (empty bins = the clip had no decodable audio; draw nothing).
    // One column per CSS pixel, taking the loudest bin under it — stays a
    // crisp waveform at any zoom instead of smearing into a solid block.
    if (peaks && peaks.bins.length > 0) {
      ctx.fillStyle = "rgba(0, 238, 252, 0.5)";
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
      ctx.fillStyle = "rgba(226, 223, 255, 0.25)";
      ctx.font = "11px Quicksand, sans-serif";
      ctx.fillText("decoding audio…", 10, H / 2 + 4);
    }

    // Time ticks — pick a step that keeps labels ~90px apart
    const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const step = steps.find((s) => (s / zoomMs) * W >= 90) ?? 60000;
    ctx.font = "10px Quicksand, sans-serif";
    for (let t = Math.ceil(viewStartMs / step) * step; t <= viewEnd; t += step) {
      const x = xOf(t);
      ctx.fillStyle = "rgba(226, 223, 255, 0.18)";
      ctx.fillRect(x, 0, 1, H);
      ctx.fillStyle = "rgba(226, 223, 255, 0.5)";
      const secs = t / 1000;
      const label = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}${step < 1000 ? `.${Math.round((secs % 1) * 10)}` : ""}`;
      ctx.fillText(label, x + 3, 11);
    }

    // Lines
    lines.forEach((l, i) => {
      if (l.endMs < viewStartMs || l.startMs > viewEnd) return;
      const x1 = xOf(l.startMs);
      const x2 = xOf(l.endMs);
      const color = charColor(l.characterId);
      const active = i === sel;
      ctx.fillStyle = color + (active ? "55" : "2e");
      ctx.fillRect(x1, 3, x2 - x1, H - 6);
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x1, 3, x2 - x1, H - 6);
      // Edge handles on the selected line
      if (active) {
        ctx.fillStyle = "#e2dfff";
        ctx.fillRect(x1 - 1.5, 3, 3, H - 6);
        ctx.fillRect(x2 - 1.5, 3, 3, H - 6);
      }
      // Labels only where they have room — at low zoom they just collide
      if (x2 - x1 > 44) {
        ctx.fillStyle = active ? "#e2dfff" : "rgba(226,223,255,.7)";
        ctx.font = "700 10px Quicksand, sans-serif";
        const label = `${i + 1}. ${l.text}`;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x1 + 3, 3, Math.max(0, x2 - x1 - 6), H - 6);
        ctx.clip();
        ctx.fillText(label, x1 + 5, H - 9);
        ctx.restore();
      }
    });

    // Trim: dim everything outside the kept range, gold handles at the edges
    if (trim) {
      ctx.fillStyle = "rgba(10, 10, 42, 0.62)";
      const tx1 = xOf(trim.startMs);
      const tx2 = xOf(trim.endMs);
      if (tx1 > 0) ctx.fillRect(0, 0, Math.min(tx1, W), H);
      if (tx2 < W) ctx.fillRect(Math.max(0, tx2), 0, W - tx2, H);
      ctx.fillStyle = "#ffd54a";
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
      ctx.fillStyle = "#ffb4ab";
      ctx.fillRect(px - 0.5, 0, 1.5, H);
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 7);
      ctx.fill();
    }
  }, [peaks, durationMs, playheadMs, lines, sel, viewStartMs, zoomMs, trim, charColor]);

  // ---- Interaction ----
  const msAt = (clientX: number) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const { viewStartMs: vs, zoomMs: z } = stateRef.current;
    return vs + ((clientX - r.left) / r.width) * z;
  };
  const pxPerMs = () => {
    const canvas = canvasRef.current!;
    return canvas.getBoundingClientRect().width / stateRef.current.zoomMs;
  };

  const hitTest = (ms: number): Drag => {
    const { lines: ls, sel: s, trim: t } = stateRef.current;
    const tolMs = EDGE_PX / pxPerMs();
    // Selected line's edges win, then any line's edges
    const order = s >= 0 ? [s, ...ls.map((_, i) => i).filter((i) => i !== s)] : ls.map((_, i) => i);
    for (const i of order) {
      if (Math.abs(ls[i].startMs - ms) < tolMs) return { kind: "edge", line: i, edge: "startMs" };
      if (Math.abs(ls[i].endMs - ms) < tolMs) return { kind: "edge", line: i, edge: "endMs" };
    }
    if (t) {
      if (Math.abs(t.startMs - ms) < tolMs) return { kind: "trim", edge: "startMs" };
      if (Math.abs(t.endMs - ms) < tolMs) return { kind: "trim", edge: "endMs" };
    }
    for (const i of order) {
      if (ms >= ls[i].startMs && ms <= ls[i].endMs) {
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
    const { lines: ls, sel: s } = stateRef.current;
    const hit = hitTest(ms);
    // Clicking an unselected line selects it (and scrubs there)
    const under = ls.findIndex((l) => ms >= l.startMs && ms <= l.endMs);
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
      const hit = hitTest(ms);
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

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
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

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-28 rounded-md border-2 border-outline-variant bg-surface-container-lowest touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    />
  );
}
