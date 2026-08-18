// Browser port of scenes/subs-to-pack.mjs's parsing: SRT/VTT text in,
// draft characters + lines out. Speaker prefixes ("VADER: …", "- LEIA: …")
// become characters; dual-speaker cues split evenly across the cue window.

export type DraftCharacter = { id: string; name: string; emoji: string };
export type DraftLine = { characterId: string; text: string; startMs: number; endMs: number };

const toMs = (h: string, m: string, s: string, ms: string) =>
  Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000 + Number(ms);

const TIME_RE =
  /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

const SPEAKER_RE = /^-?\s*([A-Z][A-Z .'-]{1,24}):\s*(.+)$/;

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseSubtitles(subText: string): {
  characters: DraftCharacter[];
  lines: DraftLine[];
} {
  const cues: { startMs: number; endMs: number; text: string }[] = [];
  for (const block of subText.replace(/\r/g, "").split(/\n\n+/)) {
    const blockLines = block.split("\n").filter(Boolean);
    const timeIdx = blockLines.findIndex((l) => TIME_RE.test(l));
    if (timeIdx === -1) continue;
    const m = blockLines[timeIdx].match(TIME_RE)!;
    const [, h1 = "0", m1, s1, ms1, h2 = "0", m2, s2, ms2] = m;
    const text = blockLines
      .slice(timeIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const startMs = toMs(h1, m1, s1, ms1);
    const endMs = toMs(h2, m2, s2, ms2);
    // YouTube auto-captions emit near-zero-length rolling duplicates — skip them.
    if (endMs - startMs < 300) continue;
    cues.push({ startMs, endMs, text });
  }

  const characters = new Map<string, string>();
  const lines: DraftLine[] = [];
  for (const cue of cues) {
    const parts = cue.text.replace(/^-\s*/, "").split(/\s+-\s+/);
    const span = (cue.endMs - cue.startMs) / parts.length;
    parts.forEach((part, i) => {
      const sm = part.match(SPEAKER_RE);
      let characterId = "";
      let text = part;
      if (sm) {
        characterId = slug(sm[1]);
        text = sm[2].trim();
        if (!characters.has(characterId)) {
          const name = sm[1].trim();
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

  return {
    characters: [...characters].map(([id, name]) => ({ id, name, emoji: "🎭" })),
    lines,
  };
}

export const slugify = slug;
