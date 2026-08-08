// Builds the built-in demo dub pack "The Last Slice" using macOS `say` + ffmpeg.
// Output: public/scenes/last-slice/{clip.mp4, original.m4a, cues.json}
// Requires: macOS (say), ffmpeg + ffprobe on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "public/scenes/last-slice");
const tmp = join(root, "scenes/.tmp-last-slice");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(outDir, { recursive: true });

const CHARACTERS = [
  { id: "margo", name: "Margo", voice: "Samantha", color: "0xbd00ff", emoji: "🍕" },
  { id: "gerald", name: "Gerald", voice: "Daniel", color: "0x008b94", emoji: "🐈" },
];

const SCRIPT = [
  ["margo", "Step away from the fridge, Gerald."],
  ["gerald", "I was only checking the milk."],
  ["margo", "The last slice is gone."],
  ["gerald", "Perhaps the cat ate it."],
  ["margo", "We do not have a cat!"],
  ["gerald", "Then who has been knocking things off the counter?"],
  ["margo", "You have crumbs on your collar."],
  ["gerald", "It was delicious. And I would do it again."],
];

const LEAD_IN_MS = 1200;
const GAP_MS = 550;
const TAIL_MS = 1500;

const ffprobeDurationMs = (file) =>
  Math.round(
    parseFloat(
      execFileSync("ffprobe", [
        "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file,
      ]).toString()
    ) * 1000
  );

// 1. Synthesize each line and measure it
let cursor = LEAD_IN_MS;
const lines = [];
for (let i = 0; i < SCRIPT.length; i++) {
  const [characterId, text] = SCRIPT[i];
  const chara = CHARACTERS.find((c) => c.id === characterId);
  const aiff = join(tmp, `${i}.aiff`);
  execFileSync("say", ["-v", chara.voice, "-o", aiff, text]);
  const durMs = ffprobeDurationMs(aiff);
  lines.push({ index: i, characterId, text, startMs: cursor, endMs: cursor + durMs, aiff });
  cursor += durMs + GAP_MS;
}
const durationMs = cursor - GAP_MS + TAIL_MS;

// 2. Mix the full original audio: each line delayed to its startMs over silence
const delayInputs = lines.flatMap((l) => ["-i", l.aiff]);
const delayFilters = lines
  .map((l, i) => `[${i}:a]adelay=${l.startMs}|${l.startMs}[d${i}]`)
  .join(";");
const mixInputs = lines.map((_, i) => `[d${i}]`).join("");
execFileSync("ffmpeg", [
  "-y", ...delayInputs,
  "-filter_complex",
  `${delayFilters};${mixInputs}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${durationMs}ms[out]`,
  "-map", "[out]", "-c:a", "aac", "-b:a", "128k",
  join(outDir, "original.m4a"),
], { stdio: "ignore" });

// 3. Render the video: neon color washes per speaking character over the night base.
// (No burned-in text — the app renders captions as styled lower-thirds from cues.json.)
const washes = lines.map((l) => {
  const chara = CHARACTERS.find((c) => c.id === l.characterId);
  const on = `enable='between(t,${(l.startMs / 1000).toFixed(3)},${(l.endMs / 1000 + 0.35).toFixed(3)})'`;
  const side = chara.id === CHARACTERS[0].id ? "x=0:w=iw/2" : "x=iw/2:w=iw/2";
  return [
    `drawbox=x=0:y=0:w=iw:h=ih:color=${chara.color}@0.18:t=fill:${on}`,
    `drawbox=${side}:y=0:h=ih:color=${chara.color}@0.35:t=fill:${on}`,
  ];
}).flat();
execFileSync("ffmpeg", [
  "-y",
  "-f", "lavfi", "-i", `color=c=0x100f2f:s=640x360:r=24:d=${durationMs / 1000}`,
  "-vf", washes.join(","),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-an",
  join(outDir, "clip.mp4"),
], { stdio: ["ignore", "ignore", "inherit"] });

// 4. Cue sheet
writeFileSync(
  join(outDir, "cues.json"),
  JSON.stringify(
    {
      id: "last-slice",
      title: "The Last Slice",
      tagline: "A kitchen standoff. A missing slice. No survivors.",
      durationMs,
      characters: CHARACTERS.map(({ id, name, emoji }) => ({ id, name, emoji })),
      lines: lines.map(({ aiff: _drop, ...l }) => l),
    },
    null,
    2
  )
);
// Register in the scene index
const indexPath = join(root, "public/scenes/index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
if (!index.includes("last-slice")) index.unshift("last-slice");
writeFileSync(indexPath, JSON.stringify(index, null, 2));

rmSync(tmp, { recursive: true, force: true });
console.log(`Built ${outDir} — ${lines.length} lines, ${(durationMs / 1000).toFixed(1)}s`);
