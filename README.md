# 🎬 Dub-Off

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
(per-line waveforms, countdown, retakes) → synced dubbed screening → download or share the
final cut as a video file. Runs fully client-side. Party mode (lobby + Favorite Voice voting) is next — the Worker/API
scaffolding is in place, the Durable Object isn't built yet.

## Repo layout — two separate apps

| Directory | What it is | Deploys as |
|---|---|---|
| [app/](app/) | The game itself (React + Vite SPA on a Worker) | `dub-off-app` → app.dub-off.com |
| [site/](site/) | Static SEO landing page (plain HTML, no framework) | `dub-off` → dub-off.com |

Each has its own `package.json` and `wrangler.jsonc` — they share nothing and deploy
independently. Until the custom domain is wired up in the Cloudflare dashboard, the
site's "Play now" links (hardcoded to app.dub-off.com in `site/public/index.html`)
should be pointed at the app's workers.dev URL.

```bash
npm --prefix app install
npm run dev            # the game, on :5173 (Vite + Workers runtime)
npm run dev:site       # the landing page, on :8788 (wrangler dev)
npm run deploy:app     # build + deploy the game
npm run deploy:site    # deploy the landing page
```

### CI deploys (Workers Builds)

Both workers deploy automatically on push via the Cloudflare dashboard's GitHub
integration (Workers → Create → Import a repository). One worker per app:

| | `dub-off` (site) | `dub-off-app` (game) |
|---|---|---|
| Root directory | `site` | `app` |
| Build command | *(empty)* | `npm run build` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` |

Scene media never goes through git (it's ignored), so the deployed worker serves
`/scenes/*` from the **dub-off-scenes R2 bucket** when a file isn't in the build.
After building a pack locally, push its media once:

```bash
npm --prefix app run scene:push
```

Local dev never touches R2 — the files in `app/public/scenes/` are served directly.

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
`public/scenes/index.json`.

### The scene editor (the easy way)

Run the dev server and open **`/editor`** (or the "Build a scene" card in the scene
picker). Load a video file — or **paste a YouTube link** (needs
`brew install yt-dlp`), which also pulls the video's subtitles/auto-captions to seed
the line list. Then edit visually: scrub the video, select a line, hit **I**/**O**
to mark its in/out points at the playhead, preview any line instantly, assign
characters, and press **Build scene** — the dev server runs the ffmpeg + demucs
pipeline and the scene lands in the picker. **Push to R2** afterward makes it
available to CI deploys. Drafts autosave to localStorage.

The build API only exists in local dev; production builds of the editor fall back
to exporting the pack.json for the CLI flow below.

### The CLI (what the editor drives)

The repo tracks **pack definitions** (`app/scenes/packs/*.json`) but never the media —
clips, audio, and anything in `movies/` are gitignored, same approach The Choicer Voicer
uses with its community dub packs. The reference example is the *Revenge of the Sith*
["You turned her against me!" pack](app/scenes/packs/star-wars-turned-her.json); after
cloning, point `scene:pack` at your own clip of the scene to build its media locally.

1. Get the scene as a video file on disk (put it in `movies/`, which stays out of git).
   If it came from YouTube, paste the link into the pack's `sourceUrl` — it shows as a
   "Source" link on the scene card.
2. Draft the line list **from subtitles** — no hand-scrubbing timings:

```bash
npm --prefix app run scene:subs -- ~/Movies/your-clip.mp4 ~/Movies/your-subs.srt scenes/packs/my-scene.json
```

   Pass a video + `.srt`/`.vtt` (external subs win), a video alone (extracts its
   embedded subtitle track), or a subtitle file alone. Speaker prefixes ("VADER: …", "- LEIA: …") become characters automatically;
   dual-speaker cues are split. Then edit the draft: assign any `FILL_IN` lines,
   delete lines you don't want, set `id`/`title`.
   (No subs? Copy [app/scenes/packs/star-wars-turned-her.json](app/scenes/packs/star-wars-turned-her.json)
   as a starting point and fill in timings by scrubbing in QuickTime/VLC.)
3. Build it:

```bash
npm --prefix app run scene:pack -- ~/Movies/your-clip.mp4 scenes/packs/my-scene.json
```

4. Refresh — the scene appears in the picker. `trim.startMs/endMs` cuts extra footage;
   line timings auto-shift.

### Background audio without the original dialogue

The screening keeps the scene's music/ambience under your takes while removing the
original dialogue. `scene:pack` runs [demucs](https://github.com/adefossez/demucs)
AI vocal separation on the clip's audio (YouTube clips are stereo, so channel tricks
don't apply) and writes two stems: `background.m4a` (music/ambience) and `vocals.m4a`
(original dialogue, used as gap-filler). Install it with `pipx install demucs`, or just
have [uv](https://docs.astral.sh/uv/) on your PATH — the build falls back to `uvx`
automatically. If neither is available the pack still builds; the screening then plays
the original audio only in the gaps between lines, so takes never fight the real
dialogue.
