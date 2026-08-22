# Dub-Off — project rules

- **Verify before committing.** Never commit a speculative fix. Reproduce the
  problem, apply the candidate change in the working tree only, measure that
  it actually fixes the symptom (simulator, profiler, screenshots — whatever
  proves it), and ask the user to verify on their end. Only commit after
  their confirmation.
- **Isolate one variable at a time when debugging.** Bisect with measurements,
  not theories — a plausible cause is not a proven cause.
- **Styling rules live in [STYLING.md](STYLING.md).** Read it before touching
  CSS, theme tokens, or anything visual — it includes hard performance rules
  (e.g. no large `filter: blur()`).
- **Mobile compatible.** Every player-facing surface (landing, lobby, scene
  select, studio, screening) must work on phones: responsive layout, touch
  interactions, and mobile Safari/Chrome support for mic capture (getUserMedia),
  Web Audio, and MediaRecorder. Desktop is the richest experience; mobile is
  not optional. The scene editor (`/editor`) is the one exception — it depends
  on the local dev server and stays a desktop tool.
- **No copyrighted media in the repo.** Scene media (clips, audio, stills) is
  gitignored and lives in R2; the repo tracks only pack definitions
  (`app/scenes/packs/*.json`) and the scene index.
- **Commit and push after each completed feature.**
- Two separate apps: `app/` (the game, React+Vite on a Worker) and `site/`
  (static SEO landing). They share nothing and deploy independently.
- **The landing page (`site/`) must be fully static** — every request stays on
  dub-off.com: no third-party stylesheets, fonts, scripts, or trackers. Fonts
  are self-hosted in `site/public/fonts/` (OFL-licensed, latin subsets).
