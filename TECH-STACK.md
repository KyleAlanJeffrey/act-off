# Dub-Off — Tech Stack & Architecture

A web party game inspired by **The Choicer Voicer** (dub mode): friends join a lobby, each
gets a character in a movie scene, and each player re-records their character's lines after
hearing the originals. Then the whole scene plays back with everyone's dubs swapped in.

## Core model

- **Desktop-only.** Every player is on their own computer in a browser with a mic. No phone
  controllers, no separate host screen — every player's screen shows the full game, and the
  lobby creator gets host controls (start, advance, skip).
- **Two modes.** *Party*: lobby of friends, one character each, Favorite Voice vote at the
  end. *Solo Show*: one player voices **every character** in the scene — no lobby, no
  voting; pick a scene, record all the lines, watch your one-person dub. Solo runs entirely
  client-side plus R2 reads (no Durable Object needed), so it's also the perfect
  first-playable milestone.
- **Line-by-line recording** (the Choicer Voicer dub-pack model): a scene is pre-chopped
  into ordered, per-character lines. For each of your lines you see the **text and the
  original audio's waveform**, listen to the original delivery, then record your take.
  Retakes are per-line.
- Playback sync is trivial with this model: each recorded line is scheduled at its line's
  `startMs` over the muted video. No continuous-take alignment problems.

## Stack (all Cloudflare)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Fast to build; ships as static assets on Workers |
| Waveforms | **wavesurfer.js** | Renders the scene audio waveform, highlights/plays a line's region, and renders the player's recorded take for side-by-side comparison |
| Hosting | Cloudflare Workers with static assets (`wrangler`) | One deploy target for app + API |
| Realtime / lobby state | **Durable Objects** (one DO per lobby) with WebSocket Hibernation | Authoritative game state machine, ordered events, cheap idle lobbies |
| Media storage | **R2** | Scene clips + per-line original audio + player take uploads; served via Worker with range requests |
| Persistent metadata | **D1** (optional at first) | Scene library metadata; the DO's storage covers a live game |
| Room codes | Worker-generated, mapped via `idFromName(code)` | No extra store |
| Audio capture | `MediaRecorder` (webm/opus; mp4/aac Safari fallback) | Desktop browsers all support it |
| Optional AI judge | Workers AI (Whisper transcript match, or audio-embedding similarity) | Choicer Voicer-style "judges score your impression" — nice-to-have, not core |

## Scene asset format (the "dub pack")

Mirrors Choicer Voicer's pack layout (its Star Wars pack = 17 ogg clips split between two
characters, filenames encoding order + character):

```
scenes/<scene-id>/
  clip.mp4            # the video, played muted during dub playback
  original.ogg        # full original scene audio (for waveform + reference listens)
  lines/07_vader.ogg  # optional pre-sliced per-line originals (else sliced client-side by timing)
  cues.json
```

```jsonc
// cues.json
{
  "title": "You Turned Her Against Me",
  "durationMs": 85000,
  "characters": [{ "id": "anakin", "name": "Anakin", "portraitUrl": "..." }],
  "lines": [
    { "index": 1, "characterId": "anakin", "text": "You turned her against me!",
      "startMs": 3200, "endMs": 5900 }
  ]
}
```

The client loads `original.ogg` into wavesurfer once; each line card is a **region**
(`startMs → endMs`) it can highlight and play. Pre-sliced line files are only needed if you
want to skip client-side slicing.

## Game flow / state machine (lives in the lobby Durable Object)

```
Party: LOBBY → SCENE_SELECT → ROLE_ASSIGN → RECORDING → SCREENING → VOTING → RESULTS → (next round or end)
Solo:           SCENE_SELECT → RECORDING → SCREENING → (replay / new scene)   # local state only, no DO
```

- Every state change broadcast over WebSocket to all players.
- Players send: `join`, `ready`, `pickScene`, `lineSubmitted(lineIndex)`, `allDone`, `vote`.
- **Voting:** after the screening, everyone votes for their **Favorite Voice** of the round
  (one vote, not yourself). The DO tallies live, breaks ties by earliest submission, and
  the winner's score carries across rounds for a season leaderboard. Optional bonus
  categories ("Funniest Line") can be toggled by the director but Favorite Voice is the
  headline award every round.
- The DO enforces the recording timer with `alarm()` and tracks per-player, per-line
  submission status (drives everyone's "who's still recording" view).

## Recording flow (per line)

1. Line card shows: character, **line text**, and the original's **waveform region**;
   ▶ plays just that segment (as many times as you want — mimicry is the game).
2. Record: 3-2-1 countdown → `MediaRecorder` captures until you stop (soft cap ~2× the
   original line length). Your take renders as a second waveform under the original.
3. Play back / re-record / accept. Accepting uploads the blob:
   `PUT /api/lobby/:code/take/:playerId/:lineIndex` → R2. (Solo mode skips the upload —
   takes stay in memory/IndexedDB and mix locally at screening.)
4. All lines accepted → player is "done"; DO flips to SCREENING when everyone's done or
   the timer expires (missing lines fall back to the original audio — or silence, funnier).

## Synced screening (everyone watches together)

Each client preloads the muted video + every take from R2 (decoded via Web Audio). The DO
broadcasts `startAt: <serverTime + 3s>`; clients schedule video start and every line buffer
at its `startMs` with `AudioContext` sample-accurate timing. No streaming mixer needed —
each machine mixes locally, and everyone laughs within ~50ms of each other.

## Content / copyright note

Don't ship copyrighted movie clips with the game. Choicer Voicer dodges this via
user-made packs — do the same: define the pack format above, let lobbies use
public-domain scenes you ship + user-uploaded private packs.

## Project layout

```
dub-off/
  wrangler.jsonc
  src/
    worker/
      index.ts       # API routes, R2 access, DO export
      lobby-do.ts    # Durable Object: state machine, WebSocket handling
    app/
      pages/         # see PAGE-PROMPTS.md
      lib/ws.ts      # typed WebSocket client
      lib/audio.ts   # MediaRecorder capture, Web Audio scheduled playback
      lib/waveform.ts# wavesurfer helpers (regions per line)
  scenes/            # dub packs (cues.json + media) + upload script → R2
```

## API sketch

- `POST /api/lobby` → `{ code }` (creates DO)
- `GET  /api/lobby/:code/ws?name=...` → WebSocket upgrade (proxied to DO)
- `PUT  /api/lobby/:code/take/:playerId/:lineIndex` → store take in R2
- `GET  /api/lobby/:code/takes` → manifest of all takes for screening preload
- `GET  /api/scene/:id/(clip|audio|cues)` → R2 reads

## Deploy

Single `wrangler deploy`. Bindings: `LOBBY` (DO), `MEDIA` (R2), `DB` (D1, later),
`ASSETS` (Vite build). Local dev: `wrangler dev` emulates DO + R2.
