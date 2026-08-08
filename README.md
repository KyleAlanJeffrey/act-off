# 🎬 Act-Off

A desktop web party game where friends re-record the dialogue of a movie scene **line by
line** with their own voices, then watch the dubbed scene back together and vote for the
**Favorite Voice**. Inspired by [The Choicer Voicer](https://yeahmaybe.itch.io/the-choicer-voicer)'s
dub mode.

## How it plays

**Party mode** — a lobby of friends, each on their own computer with a mic:

1. **Join** a lobby with a 4-letter room code (mic check included).
2. **Vote on a scene**, then get **cast** as one of its characters.
3. **Record your lines** in the studio: for each line you see the text and the original
   audio's waveform, listen to the real delivery as many times as you want, then record
   your take. Retakes are per-line.
4. **Screening** — everyone watches the scene with all the dubs swapped in, synced across
   every player's screen.
5. **Vote for Favorite Voice** (never yourself) → awards ceremony → season leaderboard →
   encore with a new scene.

**Solo Show** — one player voices *every* character in the scene. No lobby, no voting;
pick a scene, record all the lines, watch your one-person dub. Runs entirely client-side,
so it's also the first-playable milestone.

## Status

Pre-code: architecture, page specs, and design reference are done; implementation hasn't
started.

## Docs

| File | What it is |
|---|---|
| [TECH-STACK.md](TECH-STACK.md) | Architecture: Cloudflare Workers + Durable Objects + R2, the dub-pack scene format, recording/playback sync model, game state machine, API sketch |
| [PAGE-PROMPTS.md](PAGE-PROMPTS.md) | Copy-paste prompts for UI generators — a global design/type-contract prompt plus one prompt per page (11 pages + solo variants) |
| [design/](design/) | **Pop-Neon Night** design reference from Stitch — see below |

## Design: Pop-Neon Night

High-energy "backstage karaoke party": deep indigo-purple night backgrounds with neon
accents — hot-pink primary, electric-cyan secondary, bright-lime success, marquee gold
reserved for winners. Hyper-rounded shapes (pill buttons, 16px+ radii), mandatory 3px
borders and neon glows instead of shadows. Type: **Syne** (display) + **Quicksand** (UI).

- Full token sheet + component rules: [design/pop_neon_night/DESIGN.md](design/pop_neon_night/DESIGN.md)
- Reference screens (`screen.png` + `code.html` each): [landing_page](design/landing_page/),
  [lobby](design/lobby/), [casting_reveal](design/casting_reveal/),
  [screening_room](design/screening_room/), [results_awards](design/results_awards/)

## Tech stack (all Cloudflare)

- **React + Vite + TypeScript + Tailwind**, served as static assets from a **Worker**
- **Durable Objects** — one per lobby: authoritative game state machine + WebSockets
- **R2** — scene clips, original audio, and player take uploads
- **wavesurfer.js** — line waveforms (original vs. your take)
- `MediaRecorder` for capture, Web Audio for sample-accurate synced screening
- **D1** (later) for the persistent scene library; optional Workers AI "judge"

## Scene content

Scenes are "dub packs": `clip.mp4` + `original.ogg` + `cues.json` (per-line character,
text, and start/end timings). No copyrighted clips ship with the game — public-domain
scenes plus user-made private packs, same approach The Choicer Voicer uses.
