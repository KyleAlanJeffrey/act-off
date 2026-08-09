# Dub-Off — UI Generation Prompts

Feed these to a UI-generation app (v0, Lovable, Claude, etc.) one at a time, **starting with
the Global prompt**, then one prompt per page. Each page prompt includes the props/state it
receives so the generated UI wires cleanly into the real WebSocket client later.

One device target: **desktop browser** (min ~1024px wide). Every player sees the full game
on their own computer; the lobby creator ("director") gets extra host controls. No phone
layouts needed.

---

## 0. Global (send first, keep in context for every page)

> Build pages for "Dub-Off", a desktop web party game where friends re-record the dialogue
> of a movie scene line-by-line with their own voices (inspired by The Choicer Voicer's dub
> mode), then watch the dubbed scene together. Tone: **"Pop-Neon Night"** — a high-energy
> backstage-karaoke-party aesthetic. Deep indigo-purple night backgrounds, neon hot-pink
> primary, electric-cyan secondary, bright-lime success, marquee gold reserved for winners.
> Hyper-rounded shapes (pill buttons, 16px card radii), mandatory 3px borders, neon glow
> instead of shadows. Syne (800) for display type, Quicksand for UI/body. Full token sheet
> and component rules are in `design/pop_neon_night/DESIGN.md`; example screens in
> `design/*/screen.png + code.html` — match them.
>
> Tech: React + TypeScript + Tailwind. Desktop-only layouts. No backend calls — every page
> is a pure component taking typed props; interactive elements call callback props.
> Dark studio theme default. Bold display face for titles, clean sans for UI.
> Waveforms are core to the visual identity — where a prompt says "waveform", render a
> placeholder `<div data-waveform>` container styled as a panel (wavesurfer.js mounts there
> later), with play/pause controls you wire to callbacks.
>
> Shared types (use these exact shapes in props):
> ```ts
> type Player = { id: string; name: string; avatar: string; ready: boolean; isDirector: boolean };
> type Scene = { id: string; title: string; thumbnailUrl: string; durationSec: number;
>                characters: Character[] };
> type Character = { id: string; name: string; portraitUrl: string; lineCount: number };
> type CueLine = { index: number; characterId: string; text: string; startMs: number; endMs: number };
> type LineTake = { lineIndex: number; state: 'empty'|'recording'|'recorded'|'accepted'; durationMs?: number };
> type Phase = 'LOBBY'|'SCENE_SELECT'|'ROLE_ASSIGN'|'RECORDING'|'SCREENING'|'VOTING'|'RESULTS';
> ```

---

## 1. Landing page

> Landing page. Marquee-style title "DUB-OFF", one-line pitch ("Re-voice famous scenes with
> your friends. Line by line. Badly."), three actions: "Start a Show" (party lobby), a join
> form (4-letter room code + "Join"), and a distinct secondary card **"Solo Show — play
> EVERYONE"** (one-person-does-all-the-voices mode; no lobby needed).
> Props: `onHost(): void`, `onJoin(code: string): void`, `onSolo(): void`.
> Footer: 3-step how-it-works strip (Get cast → Record your lines → Watch the dub).

## 2. Join / identity screen

> After entering a code (or creating a room): pick a display name (max 12 chars) and an
> avatar from a grid of 12 theatrical masks/faces. Below that, a **mic check panel**: mic
> selector dropdown, live input level meter, and a "test clip" record/playback button —
> players must pass mic check before the join button enables. Props: `code: string`,
> `takenAvatars: string[]`, `micDevices: {id, label}[]`, `micLevel: number`,
> `micTestState: 'idle'|'recording'|'playing'|'ok'`, `onSelectMic(id): void`,
> `onMicTest(): void`, `onJoin(name, avatar): void`, `error?: string`.

## 3. Lobby

> Waiting room everyone sees. Room code prominent with a copy-link button, cast list grid
> (avatar, name, ready check, mic-ok badge, "DIRECTOR" tag on the creator), and a ready
> toggle for yourself. The director additionally sees "Start Show" (enabled when 2+ players
> are ready). Rotating status lines ("Warming up vocal cords..."). Props: `code: string`,
> `joinUrl: string`, `players: Player[]`, `me: Player`, `onReadyToggle(ready): void`,
> `onStart(): void`.

## 4. Scene selection

> Everyone votes on the scene. Grid of 3 scene cards: thumbnail, title, duration, character
> chips with line counts (e.g. "Anakin · 9 lines"), and a live vote tally. One selectable,
> countdown ring for `secondsLeft`. Director gets a "lock it in" override button.
> Props: `scenes: Scene[]`, `votes: Record<string, number>`, `selected?: string`,
> `secondsLeft: number`, `isDirector: boolean`, `onPick(sceneId): void`, `onLock(): void`.

## 5. Casting reveal

> One page for everyone: "Casting call" — character portraits flip one by one (staggered)
> to reveal which player got each part; your own card gets a spotlight and a banner
> "You're playing OBI-WAN — 8 lines". Button "To the studio →" (ready-up; shows how many
> others are ready). Props: `scene: Scene`,
> `assignments: { character: Character; player: Player }[]`, `myCharacterId: string`,
> `readyCount: number`, `totalCount: number`, `onReady(): void`.

## 6. Recording studio — THE core page

> The main gameplay page; make this excellent. Desktop three-zone layout:
>
> **Left rail** — "Your lines" checklist: one chip per line (`#`, first words, state icon
> from `LineTake.state`), progress "3/8 recorded", and the recording-window countdown.
> Clicking a chip focuses that line.
>
> **Center — the focused line card** (one line at a time):
> 1. Character name + the **full line text, large**, teleprompter-style.
> 2. **Original delivery**: waveform panel (`data-waveform` id="original") with a ▶ button
>    ("Listen to the original") and the line's duration. Players can replay endlessly.
> 3. **Your take**: below the original, a second waveform panel (id="take") that fills in
>    after recording — visually side-by-side-stacked so you can compare shapes.
> 4. Transport row: big red ● RECORD (3-2-1 countdown overlay when armed, pulsing border +
>    live mic level while recording, auto-stop bar showing the soft time cap), then
>    ▶ Play my take · ↺ Re-record · ✓ Accept take.
> 5. Prev/next line arrows.
>
> **Right rail** — muted video preview of the scene with a marker showing where the focused
> line sits in the timeline, plus castmates' progress (avatar + "5/9 ✓").
>
> When all lines are accepted: the left rail's submit area becomes a glowing
> "That's a wrap — I'm done ✓" button.
>
> **Solo mode** (`soloMode: true`): the same page, but every line in the scene is yours —
> the left rail groups the checklist by character with character portrait headers, the
> focused line card shows a prominent character badge ("now voicing: OBI-WAN") so the
> player shifts voices consciously, there's no castmates panel and no countdown (take your
> time), and "I'm done" goes straight to screening.
>
> Props: `soloMode: boolean`, `scene: Scene`, `videoUrl: string`, `cues: CueLine[]`, `myCharacterId: string`,
> `myLines: CueLine[]`, `takes: LineTake[]`, `focusedLineIndex: number`,
> `secondsLeft: number`, `micLevel: number`,
> `castProgress: { player: Player; done: number; total: number }[]`,
> `onFocusLine(i): void`, `onPlayOriginal(): void`, `onRecord(): void`, `onStop(): void`,
> `onPlayTake(): void`, `onRerecord(): void`, `onAcceptTake(): void`, `onDone(): void`.

## 7. Green room (waiting for others)

> Shown after you finish recording. "You're wrapped 🎬" header, cast progress board
> (everyone's avatar with an n/total lines meter, checkmark when done), shared countdown,
> and a low-stakes idle activity: replay your own accepted takes from a list. Director sees
> "Start screening now" (skips stragglers — their lines fall back to the original audio).
> Props: `castProgress: {...}[]`, `secondsLeft: number`, `myTakes: LineTake[]`,
> `isDirector: boolean`, `onPlayTake(lineIndex): void`, `onForceScreening(): void`.

## 8. Screening room

> Premiere playback, synced for everyone. Curtain-open intro, then the video large and
> centered. Lower-third shows the active line's text, which character is "speaking", and
> the player voicing them (from cue timing). A subtle audio-reactive waveform strip under
> the video. Countdown "Premiere starts in 3…2…1" before playback (clients sync to a shared
> start time). End card "That's a wrap!" with Replay (director) and Continue to voting
> (director). Props: `videoUrl: string`, `cues: CueLine[]`,
> `assignments: { character: Character; player: Player }[]`, `startsInSec?: number`,
> `playing: boolean`, `currentTimeMs: number`, `isDirector: boolean`,
> `onReplay(): void`, `onContinue(): void`.

## 9. Voting — Favorite Voice

> The round's big vote: **"Who was your Favorite Voice?"** as a full-screen moment, not a
> form. Each castmate (never yourself) is a large card: avatar, name, character tag ("Kyle
> as Obi-Wan"), and a ▶ button that replays a short highlight of one of their takes so you
> can compare before voting. Pick one → card locks in with a stamped "MY VOTE" seal and a
> live "4/6 votes in" tracker while waiting for others. If the director enabled bonus
> categories ("Funniest Line", "Most Committed to the Bit"), they appear as a quick
> secondary strip after the main vote — but Favorite Voice is always the headline.
> Props: `castmates: { player: Player; character: Character }[]`,
> `myVote?: string`, `votesIn: number`, `totalVoters: number`,
> `bonusCategories: { id: string; label: string }[]`,
> `bonusVotes: Record<string, string | undefined>`,
> `onPlayHighlight(playerId): void`, `onVote(playerId): void`,
> `onBonusVote(categoryId, playerId): void`.

## 10. Results

> The crowning of **Favorite Voice**. Big envelope-open reveal: winner's avatar spotlighted
> with confetti, their character tag, and the vote tally bar for the whole cast. Bonus
> category winners (if enabled) reveal as smaller follow-ups. Then the season leaderboard
> (Favorite Voice wins carry points across rounds). Your own win gets a personal banner
> ("YOU are the Favorite Voice 🏆"). Director controls: "Encore! (new scene, same cast)"
> and "End Show".
> Props: `favoriteVoice: { winner: Player; character: Character; tally: { player: Player; votes: number }[] }`,
> `bonusAwards: { category: string; winner: Player; character: Character }[]`,
> `leaderboard: { player: Player; score: number }[]`, `iWon: boolean`,
> `isDirector: boolean`, `revealIndex: number`, `onNextReveal(): void`,
> `onNextRound(): void`, `onEnd(): void`.

## 11. Shared: connection/error states

> Small component set used everywhere: reconnecting banner ("Lost the director...
> reconnecting"), mic-permission-lost modal with re-grant instructions, "lobby not found"
> full-page state, and a phase-mismatch catch-all ("The show moved on — rejoining...").
> Props: `state: 'reconnecting'|'micLost'|'notFound'|'resync'`.

---

## Solo Show mode — page variants (send after the pages above)

> Solo Show is the one-player mode: you voice EVERY character, no lobby. Reuse the pages
> above with these variants (each takes a `soloMode: boolean` prop where mentioned):
> - **Skip entirely:** join/lobby (2, 3), green room (7), voting (9), results (10).
> - **Scene select (4):** no votes/countdown/director — just a picker; clicking a scene
>   card proceeds. Add a mini mic-check strip at the top (since page 2 was skipped).
> - **Casting reveal (5):** replace with a quick splash: "Tonight, the part of EVERYONE
>   will be played by YOU" — all character portraits flip to the same player avatar.
>   One button: "To the studio →".
> - **Recording studio (6):** solo variant already specced in page 6.
> - **Screening room (8):** no sync countdown or director gating; playback starts on
>   click. End card offers "Replay", "Re-record lines" (back to studio), and "New scene".

---

## Suggested order to generate

Global → **6 (recording studio, hardest — sets the visual bar)** → 8 → 3 → 5 → 2 → the
rest. Everything else follows page 6's patterns.
