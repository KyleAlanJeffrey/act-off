# Dub-Off — project rules

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
- Styling flows through the Tailwind v4 `@theme` tokens in
  `app/src/app/index.css` (Pop-Neon Night). Canvas code reads tokens via
  `lib/theme.ts` — no hardcoded palette hexes.
