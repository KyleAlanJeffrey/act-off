// Voice-match scoring: how closely a take matches the original delivery.
// Compares normalized energy envelopes (speech rhythm/timing) between the
// take and the original line — against the vocals stem when the pack has
// one, so music never pollutes the reference — plus a duration match.
// It's a party score, not forensics: the curve is deliberately generous.
import type { Scene, Take } from "../types";

export type LineScore = { lineIndex: number; score: number };
export type DubScore = { total: number; grade: string; lines: LineScore[] };

const BIN_MS = 50;
const MAX_LAG_MS = 300; // forgive being up to this far ahead/behind

/** Max-abs energy per 50ms bin over [startMs, endMs] of the buffer. */
function envelope(buffer: AudioBuffer, startMs: number, endMs: number): Float32Array {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const from = Math.max(0, Math.floor((startMs / 1000) * sr));
  const to = Math.min(data.length, Math.ceil((endMs / 1000) * sr));
  const perBin = Math.max(1, Math.round((sr * BIN_MS) / 1000));
  const bins = new Float32Array(Math.max(1, Math.ceil((to - from) / perBin)));
  for (let i = from; i < to; i += 2) {
    const a = Math.abs(data[i]);
    const b = Math.floor((i - from) / perBin);
    if (a > bins[b]) bins[b] = a;
  }
  return bins;
}

function normalize(e: Float32Array): Float32Array {
  let max = 0;
  for (const v of e) if (v > max) max = v;
  if (max < 1e-4) return e; // silence — leave as zeros
  const out = new Float32Array(e.length);
  for (let i = 0; i < e.length; i++) out[i] = e[i] / max;
  return out;
}

/** Pearson correlation of a against b shifted by `lag` bins. */
function correlation(a: Float32Array, b: Float32Array, lag: number): number {
  let n = 0,
    sa = 0,
    sb = 0,
    saa = 0,
    sbb = 0,
    sab = 0;
  for (let i = 0; i < a.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= b.length) continue;
    const x = a[i];
    const y = b[j];
    n++;
    sa += x;
    sb += y;
    saa += x * x;
    sbb += y * y;
    sab += x * y;
  }
  if (n < 4) return 0;
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  if (va <= 0 || vb <= 0) return 0;
  return cov / Math.sqrt(va * vb);
}

/** 0–100 for one take against the original line's delivery. */
export function scoreLine(
  reference: AudioBuffer,
  refStartMs: number,
  refEndMs: number,
  take: AudioBuffer
): number {
  const ref = normalize(envelope(reference, refStartMs, refEndMs));
  const tk = normalize(envelope(take, 0, take.duration * 1000));

  // A silent take earns nothing
  let energy = 0;
  for (const v of tk) energy += v;
  if (energy / Math.max(1, tk.length) < 0.02) return 0;

  // Best envelope correlation within a small lag window — rewards matching
  // the speech rhythm without punishing slightly early/late starts
  const maxLag = Math.round(MAX_LAG_MS / BIN_MS);
  let shape = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    shape = Math.max(shape, correlation(ref, tk, lag));
  }

  // Filling the same amount of time as the original counts too
  const durMatch = Math.min(tk.length, ref.length) / Math.max(tk.length, ref.length, 1);

  const raw = 0.75 * shape + 0.25 * durMatch;
  return Math.round(100 * Math.pow(Math.max(0, Math.min(1, raw)), 0.8));
}

function grade(total: number): string {
  if (total >= 90) return "Uncanny double!";
  if (total >= 80) return "Certified voice twin";
  if (total >= 65) return "Nailed the rhythm";
  if (total >= 50) return "Solid dub";
  if (total >= 35) return "Creative liberties";
  return "Off-script legend";
}

/** Scores every recorded line; total is the average over recorded lines. */
export function scoreDub(opts: {
  scene: Scene;
  /** Dialogue-only stem when available — the cleanest reference. */
  vocals: AudioBuffer | null;
  original: AudioBuffer;
  takes: Map<number, Take>;
}): DubScore | null {
  const reference = opts.vocals ?? opts.original;
  const lines: LineScore[] = [];
  for (const line of opts.scene.lines) {
    const take = opts.takes.get(line.index)?.buffer;
    if (!take) continue;
    lines.push({
      lineIndex: line.index,
      score: scoreLine(reference, line.startMs, line.endMs, take),
    });
  }
  if (lines.length === 0) return null;
  const total = Math.round(lines.reduce((s, l) => s + l.score, 0) / lines.length);
  return { total, grade: grade(total), lines };
}
