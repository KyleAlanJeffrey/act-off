# Dub-Off — styling rules

- **No large `filter: blur()` on player-facing surfaces.** A big gaussian blur
  (e.g. `blur(110px)` on a 38vw element) forces iOS Safari's GPU process to
  software-rasterize the whole area — measured ~10 seconds of multi-core CPU
  burn on page load on an iPhone 13. For soft-glow shapes, use a
  radial-gradient mask instead (`mask-image: radial-gradient(closest-side,
  black 20%, transparent)`), which is a cheap single-pass alpha multiply.
  `mix-blend-mode` and transform/opacity animations measured innocent and are
  fine. This applies to both `app/` and `site/` (the static landing repeats
  the same blob pattern inline in `site/public/index.html`).
- Styling flows through the Tailwind v4 `@theme` tokens in
  `app/src/app/index.css` (Pop-Neon Night). Canvas code reads tokens via
  `lib/theme.ts` — no hardcoded palette hexes.
