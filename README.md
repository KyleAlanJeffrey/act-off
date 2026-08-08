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

**Solo Show is playable.** Landing → mic check → scene select → casting → recording studio
(per-line waveforms, 3-2-1 countdown, retakes) → synced dubbed screening. Runs fully
client-side. Party mode (lobby + Favorite Voice voting) is next — the Worker/API
scaffolding is in place, the Durable Object isn't built yet.

```bash
npm install
npm run dev        # local dev (Vite + Workers runtime)
npm run deploy     # build + wrangler deploy
```

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

## Scene content — adding famous movie scenes

Scenes are "dub packs" under `public/scenes/<id>/`: `clip.mp4` + `original.m4a` +
`cues.json` (per-line character, text, start/end timings), listed in
`public/scenes/index.json`. The repo ships one original demo pack ("The Last Slice",
generated with macOS `say` + ffmpeg via `npm run scene:demo`).

Famous movie scenes work the same way — you supply the clip, same approach The Choicer
Voicer uses with its community dub packs. Your media never enters git (ignored by
`.gitignore`):

1. Get the scene as a video file on disk (e.g. your clip of the *Revenge of the Sith*
   "You turned her against me!" scene).
2. Copy [scenes/packs/star-wars-turned-her.example.json](scenes/packs/star-wars-turned-her.example.json)
   → fill in the real line text and start/end timings (scrub the clip in QuickTime/VLC).
3. Build it:

```bash
npm run scene:pack -- ~/Movies/your-clip.mp4 scenes/packs/star-wars-turned-her.json
```

4. Refresh — the scene appears in the picker. `trim.startMs/endMs` cuts extra footage;
   line timings auto-shift.

### Background audio without the original dialogue

The screening keeps the scene's music/ambience under your takes while removing the
original dialogue. `scene:pack` builds the stems automatically, best method first:

1. **5.1/7.1 sources** (most movie files): dialogue lives in the center channel, so the
   pack gets `background.m4a` (downmix without FC) and `vocals.m4a` (FC alone) for free —
   near-perfect separation, no extra tools.
2. **Stereo sources**: install [demucs](https://github.com/adefossez/demucs)
   (`pipx install demucs`) and rebuild — AI vocal separation produces the same two stems.
3. **Neither available**: the screening falls back to playing the original audio only in
   the gaps between lines, so takes never fight the real dialogue.

Tip: when grabbing a clip, keep the surround audio track (don't downmix to stereo) and
the separation stays free.
