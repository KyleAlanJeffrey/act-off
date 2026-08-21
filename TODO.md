# TODO

## Up next
- [ ] **Verify the load fix on a slow connection** — the 310KB icon font was the
      likely culprit (now a ~5KB subset); if the landing → app hop still feels
      slow after deploy, profile again on the affected device/network.

## Standing
- [ ] **Mobile compatibility pass** — audit all player-facing pages on phone
      viewports (see CLAUDE.md); studio + screening layouts, touch targets,
      mobile Safari mic/autoplay quirks.
## Done
- [x] Live waveform parity — wider analyser window + same normalization as
      the decoded take
- [x] Voice-match scoring on the screening wrap screen (envelope correlation
      vs the vocals stem + duration match)
- [x] Slow landing → app load: icon font subset 310KB → ~5KB, display=block,
      preconnect to app.dub-off.com from the landing
- [x] Cloudflare domains + workers live (dub-off.com / app.dub-off.com)
- [x] Precision waveform timeline with drag/zoom/trim (editor)
- [x] Duplicate lines + overlap lanes (editor)
- [x] Saved drafts that re-fetch their YouTube video
- [x] Styling formalized: theme tokens single-source + CodeRabbit review
- [x] R2 scene serving + scene deploy flow (Valkyries scene pushed)
- [x] mp4 export preference for the final cut
