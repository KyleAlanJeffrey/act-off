// Builds a dub pack from a movie clip you have on disk.
//
//   npm run scene:pack -- <video-file> <pack.json>
//
// pack.json format (timings are relative to the source video, in ms):
// {
//   "id": "star-wars-turned-her",
//   "title": "You Turned Her Against Me",
//   "tagline": "High ground negotiations break down.",
//   "sourceUrl": "https://www.youtube.com/watch?v=...",  // optional provenance link
//   "trim": { "startMs": 0, "endMs": 85000 },        // optional source cut
//   "characters": [
//     { "id": "anakin", "name": "Anakin", "emoji": "🔥" },
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
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdtempSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const [videoFile, packFile] = process.argv.slice(2);
if (!videoFile || !packFile) {
  fail("Usage: npm run scene:pack -- <video-file> <pack.json>");
}
if (!existsSync(videoFile)) fail(`Video file not found: ${videoFile}`);
if (!existsSync(packFile)) fail(`Pack file not found: ${packFile}`);
for (const bin of ["ffmpeg", "ffprobe"]) {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
  } catch {
    fail(`${bin} not found on PATH — install it (brew install ffmpeg).`);
  }
}

// ---- Validate the pack definition -----------------------------------------
let pack;
try {
  pack = JSON.parse(readFileSync(packFile, "utf8"));
} catch (e) {
  fail(`${packFile} is not valid JSON: ${e.message}`);
}

if (!pack.id || !/^[a-z0-9-]+$/.test(pack.id)) {
  fail(`"id" must be a kebab-case slug (got: ${JSON.stringify(pack.id)})`);
}
if (!pack.title) fail(`"title" is required`);
if (!Array.isArray(pack.characters) || pack.characters.length === 0) {
  fail(`"characters" must be a non-empty array`);
}
for (const c of pack.characters) {
  if (!c.id || !c.name) fail(`Every character needs "id" and "name": ${JSON.stringify(c)}`);
  c.emoji ??= "🎭";
}
if (!Array.isArray(pack.lines) || pack.lines.length === 0) {
  fail(`"lines" must be a non-empty array`);
}
const charIds = new Set(pack.characters.map((c) => c.id));
pack.lines.forEach((l, i) => {
  const label = `lines[${i}]`;
  if (!charIds.has(l.characterId)) {
    fail(`${label}: characterId "${l.characterId}" is not in "characters"`);
  }
  if (!l.text || l.text.startsWith("FILL IN")) {
    fail(`${label}: fill in the real line text (got: ${JSON.stringify(l.text)})`);
  }
  if (!Number.isFinite(l.startMs) || !Number.isFinite(l.endMs) || l.startMs >= l.endMs) {
    fail(`${label}: needs numeric startMs < endMs (got ${l.startMs}..${l.endMs})`);
  }
});
const sorted = [...pack.lines].sort((a, b) => a.startMs - b.startMs);
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i].startMs < sorted[i - 1].endMs) {
    console.warn(
      `⚠ overlapping lines: "${sorted[i - 1].text}" and "${sorted[i].text}" — playback still works, but takes will talk over each other.`
    );
  }
}

const trimStart = pack.trim?.startMs ?? 0;
const trimEnd = pack.trim?.endMs ?? null;
if (trimEnd !== null && trimEnd <= trimStart) fail(`"trim": endMs must be > startMs`);

// ---- Transcode --------------------------------------------------------------
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "public/scenes", pack.id);
mkdirSync(outDir, { recursive: true });

const trimArgs = [
  ...(trimStart ? ["-ss", `${trimStart / 1000}`] : []),
  ...(trimEnd ? ["-to", `${trimEnd / 1000}`] : []),
];

console.log("Transcoding video (360p, muted)…");
execFileSync("ffmpeg", [
  "-y", ...trimArgs, "-i", videoFile,
  "-vf", "scale=-2:360",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-an",
  join(outDir, "clip.mp4"),
], { stdio: ["ignore", "ignore", "inherit"] });

console.log("Extracting original audio…");
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

// ---- Dialogue/background separation ----------------------------------------
// Goal: a background.m4a (music/ambience, no dialogue) so the screening can lay
// player takes over the real scene atmosphere, plus a vocals.m4a used as the
// fallback for lines the player never recorded.
// Demucs (AI source separation) does this well on stereo YouTube-style clips:
// its "vocals" stem is the dialogue. Runs via a local install if present,
// otherwise through uvx (cached, no permanent install).
let hasBackground = false;
let hasVocals = false;

const demucsCmd = (() => {
  try {
    execFileSync("demucs", ["--help"], { stdio: "ignore" });
    return ["demucs"];
  } catch {
    /* not installed directly */
  }
  try {
    execFileSync("uvx", ["--version"], { stdio: "ignore" });
    // demucs 4.x forgets to declare numpy; --with patches that
    return ["uvx", "--python", "3.12", "--with", "numpy", "--from", "demucs", "demucs"];
  } catch {
    return null;
  }
})();

if (demucsCmd) {
  console.log("Separating dialogue with demucs — first run downloads the model, then it's fast…");
  const sepTmp = mkdtempSync(join(tmpdir(), "act-off-demucs-"));
  try {
    execFileSync(demucsCmd[0], [
      ...demucsCmd.slice(1),
      "--two-stems=vocals", "-o", sepTmp, join(outDir, "original.m4a"),
    ], { stdio: ["ignore", "ignore", "inherit"] });
    // Output lands at <sepTmp>/<model>/<basename>/{vocals,no_vocals}.wav
    const model = readdirSync(sepTmp)[0];
    const stemDir = join(sepTmp, model, "original");
    execFileSync("ffmpeg", [
      "-y", "-i", join(stemDir, "no_vocals.wav"),
      "-c:a", "aac", "-b:a", "128k", join(outDir, "background.m4a"),
    ], { stdio: "ignore" });
    execFileSync("ffmpeg", [
      "-y", "-i", join(stemDir, "vocals.wav"),
      "-c:a", "aac", "-b:a", "96k", join(outDir, "vocals.m4a"),
    ], { stdio: "ignore" });
    hasBackground = hasVocals = true;
  } catch {
    console.warn(
      "⚠ demucs failed — building without separated stems.\n" +
      "  The screening will play the original audio between lines instead."
    );
  } finally {
    rmSync(sepTmp, { recursive: true, force: true });
  }
} else {
  console.warn(
    "⚠ No background separation available: install uv (brew install uv) or\n" +
    "  demucs (pipx install demucs), then rebuild this pack.\n" +
    "  Until then the screening plays the original audio between lines."
  );
}

// Line timings must land inside the trimmed clip. Subtitle-sourced timings
// often overshoot the clip edges by a hair — clamp small spills, fail big ones.
const CLAMP_MS = 1500;
for (const l of pack.lines) {
  const s = l.startMs - trimStart;
  const e = l.endMs - trimStart;
  if (s < -CLAMP_MS || e > durationMs + CLAMP_MS) {
    fail(
      `Line "${l.text}" (${l.startMs}..${l.endMs}ms) falls outside the trimmed clip (0..${durationMs}ms after trim). Check timings/trim.`
    );
  }
  if (s < 0 || e > durationMs) {
    console.warn(`⚠ Clamped "${l.text}" to the clip edge (was ${s}..${e}ms, clip is ${durationMs}ms).`);
    l.startMs = Math.max(l.startMs, trimStart);
    l.endMs = Math.min(l.endMs, trimStart + durationMs);
  }
}

writeFileSync(
  join(outDir, "cues.json"),
  JSON.stringify(
    {
      id: pack.id,
      title: pack.title,
      tagline: pack.tagline ?? "",
      ...(pack.sourceUrl ? { sourceUrl: pack.sourceUrl } : {}),
      durationMs,
      hasBackground,
      hasVocals,
      characters: pack.characters.map(({ id, name, emoji }) => ({ id, name, emoji })),
      lines: sorted.map((l, i) => ({
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

console.log(`\n✓ Built ${outDir} — ${pack.lines.length} lines, ${(durationMs / 1000).toFixed(1)}s`);
console.log(`✓ Registered "${pack.id}" in public/scenes/index.json — refresh the app.`);
