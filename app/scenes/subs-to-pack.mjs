// Drafts a pack.json from subtitles, so you never hand-scrub line timings.
//
//   npm run scene:subs -- <video-or-subtitle-file> [subtitle-file] [output-pack.json]
//
//   npm run scene:subs -- clip.mp4                      # embedded subtitle track
//   npm run scene:subs -- clip.mp4 subs.srt             # external subs for that video
//   npm run scene:subs -- subs.srt                      # subtitle file alone
//   npm run scene:subs -- clip.mp4 subs.srt out.json    # custom output path
//
// - .srt / .vtt files are parsed directly
// - video files get their first embedded subtitle track extracted (ffmpeg)
// - speaker prefixes ("MARGO: text", "- GERALD: text") become characters
//   automatically; unattributed lines get characterId "FILL_IN"
//
// Then: edit the draft (assign characters, delete lines you don't want,
// set id/title/trim) and run  npm run scene:pack -- <video> <pack.json>
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { basename } from "node:path";

const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const isSubFile = (p) => /\.(srt|vtt)$/i.test(p ?? "");

const args = process.argv.slice(2);
if (args.length === 0) {
  fail("Usage: npm run scene:subs -- <video-or-subtitle-file> [subtitle-file] [output-pack.json]");
}
// When both a video and a subtitle file are given, the subs win (in any order);
// the video is only the extraction source when no subtitle file is present.
const subArg = args.find(isSubFile);
const videoArg = args.find((a) => !isSubFile(a) && !a.endsWith(".json"));
const outArg = args.find((a) => a.endsWith(".json"));
const input = subArg ?? videoArg;
if (!input) fail("Pass a video and/or a .srt/.vtt file.");
if (!existsSync(input)) fail(`File not found: ${input}`);
if (videoArg && !existsSync(videoArg)) fail(`File not found: ${videoArg}`);

const outFile = outArg ?? "scenes/packs/draft.json";

// ---- Get subtitle text ------------------------------------------------------
let subText;
const lower = input.toLowerCase();
if (lower.endsWith(".srt") || lower.endsWith(".vtt")) {
  subText = readFileSync(input, "utf8");
} else {
  // Extract the first embedded subtitle stream as SRT
  const tmp = `${outFile}.extract.srt`;
  try {
    execFileSync("ffmpeg", ["-y", "-i", input, "-map", "0:s:0", tmp], {
      stdio: "ignore",
    });
    subText = readFileSync(tmp, "utf8");
  } catch {
    fail(
      `No embedded subtitle track found in ${basename(input)}.\n` +
      "  Grab a matching .srt (or extract with: ffmpeg -i video -map 0:s:0 subs.srt)\n" +
      "  and pass that instead."
    );
  } finally {
    rmSync(tmp, { force: true });
  }
}

// ---- Parse SRT/VTT ----------------------------------------------------------
const toMs = (h, m, s, ms) =>
  Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000 + Number(ms);

const TIME_RE =
  /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

const cues = [];
for (const block of subText.replace(/\r/g, "").split(/\n\n+/)) {
  const lines = block.split("\n").filter(Boolean);
  const timeIdx = lines.findIndex((l) => TIME_RE.test(l));
  if (timeIdx === -1) continue;
  const [, h1 = "0", m1, s1, ms1, h2 = "0", m2, s2, ms2] = lines[timeIdx].match(TIME_RE);
  const text = lines
    .slice(timeIdx + 1)
    .join(" ")
    .replace(/<[^>]+>/g, "") // strip styling tags
    .replace(/\{[^}]+\}/g, "") // strip ASS-style tags
    .replace(/\s+/g, " ")
    .trim();
  if (!text) continue;
  cues.push({
    startMs: toMs(h1, m1, s1, ms1),
    endMs: toMs(h2, m2, s2, ms2),
    text,
  });
}
if (cues.length === 0) fail("No subtitle cues found — is this a valid SRT/VTT?");

// ---- Speaker detection ------------------------------------------------------
// Handles "NAME: text", "- NAME: text", and dual-speaker cues where each
// "- " dash starts a new speaker (split evenly across the cue's window).
const slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SPEAKER_RE = /^-?\s*([A-Z][A-Z .'-]{1,24}):\s*(.+)$/;

const characters = new Map(); // slug -> display name
const lines = [];
for (const cue of cues) {
  // Strip a leading dash, then split multi-speaker cues on interior " - "
  // (dashes inside hyphenated words have no surrounding spaces and survive).
  const parts = cue.text.replace(/^-\s*/, "").split(/\s+-\s+/);
  const span = (cue.endMs - cue.startMs) / parts.length;
  parts.forEach((part, i) => {
    const m = part.match(SPEAKER_RE);
    let characterId = "FILL_IN";
    let text = part;
    if (m) {
      characterId = slug(m[1]);
      text = m[2].trim();
      if (!characters.has(characterId)) {
        const name = m[1].trim();
        characters.set(characterId, name[0] + name.slice(1).toLowerCase());
      }
    }
    lines.push({
      characterId,
      text,
      startMs: Math.round(cue.startMs + i * span),
      endMs: Math.round(cue.startMs + (i + 1) * span),
    });
  });
}

if (characters.size === 0) {
  characters.set("FILL_IN", "Fill In");
  console.warn(
    "⚠ No speaker names detected in the subtitles — every line's characterId is\n" +
    '  "FILL_IN". Assign real character ids before building the pack.'
  );
}

const draft = {
  id: "FILL-IN-scene-id",
  title: "FILL IN: Scene Title",
  tagline: "",
  sourceUrl: "",
  trim: { startMs: lines[0].startMs > 3000 ? lines[0].startMs - 2000 : 0, endMs: null },
  characters: [...characters].map(([id, name]) => ({ id, name, emoji: "🎭" })),
  lines,
};

writeFileSync(outFile, JSON.stringify(draft, null, 2));
console.log(`✓ Drafted ${outFile} — ${lines.length} lines, ${characters.size} detected speaker(s)`);
console.log("  Next: edit it (characters, line selection, id/title/trim), then");
console.log(`  npm run scene:pack -- ${videoArg ?? "<video-file>"} ${outFile}`);
