// Builds a dub pack from a movie clip you have on disk.
//
//   node scenes/build-pack.mjs <video-file> <pack.json>
//
// pack.json format (timings are relative to the source video):
// {
//   "id": "star-wars-turned-her",
//   "title": "You Turned Her Against Me",
//   "tagline": "High ground negotiations break down.",
//   "trim": { "startMs": 0, "endMs": 85000 },        // optional source cut
//   "characters": [
//     { "id": "anakin", "name": "Anakin", "emoji": "⚔️" },
//     { "id": "obiwan", "name": "Obi-Wan", "emoji": "🧔" }
//   ],
//   "lines": [
//     { "characterId": "anakin", "text": "You turned her against me!",
//       "startMs": 3200, "endMs": 5900 }
//   ]
// }
//
// Output: public/scenes/<id>/{clip.mp4, original.m4a, cues.json}
// and registers the id in public/scenes/index.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [videoFile, packFile] = process.argv.slice(2);
if (!videoFile || !packFile) {
  console.error("Usage: node scenes/build-pack.mjs <video-file> <pack.json>");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pack = JSON.parse(readFileSync(packFile, "utf8"));
const outDir = join(root, "public/scenes", pack.id);
mkdirSync(outDir, { recursive: true });

const trimStart = pack.trim?.startMs ?? 0;
const trimEnd = pack.trim?.endMs ?? null;
const trimArgs = [
  ...(trimStart ? ["-ss", `${trimStart / 1000}`] : []),
  ...(trimEnd ? ["-to", `${trimEnd / 1000}`] : []),
];

// Video: 360p, h264, no audio track (the app always plays it muted)
execFileSync("ffmpeg", [
  "-y", ...trimArgs, "-i", videoFile,
  "-vf", "scale=-2:360",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-an",
  join(outDir, "clip.mp4"),
], { stdio: ["ignore", "ignore", "inherit"] });

// Audio: full original soundtrack of the (trimmed) clip
execFileSync("ffmpeg", [
  "-y", ...trimArgs, "-i", videoFile,
  "-vn", "-c:a", "aac", "-b:a", "128k",
  join(outDir, "original.m4a"),
], { stdio: ["ignore", "ignore", "inherit"] });

const durationMs = Math.round(
  parseFloat(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", join(outDir, "clip.mp4"),
    ]).toString()
  ) * 1000
);

writeFileSync(
  join(outDir, "cues.json"),
  JSON.stringify(
    {
      id: pack.id,
      title: pack.title,
      tagline: pack.tagline ?? "",
      durationMs,
      characters: pack.characters,
      lines: pack.lines.map((l, i) => ({
        index: i,
        characterId: l.characterId,
        text: l.text,
        startMs: l.startMs - trimStart,
        endMs: l.endMs - trimStart,
      })),
    },
    null,
    2
  )
);

// Register in the scene index
const indexPath = join(root, "public/scenes/index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
if (!index.includes(pack.id)) index.push(pack.id);
writeFileSync(indexPath, JSON.stringify(index, null, 2));

console.log(`Built ${outDir} — ${pack.lines.length} lines, ${(durationMs / 1000).toFixed(1)}s`);
console.log(`Registered "${pack.id}" in public/scenes/index.json`);
