# TODO

- [ ] **Share center** — post your finished cut to a public gallery where
      people can watch each other's dubs and upvote them. Rough shape:
      - "Share my cut" action on the screening wrap panel: renders the dub
        (existing export pipeline) and uploads it — likely a new R2 bucket
        (`dub-off-shares`) fronted by the worker, plus a KV/D1 record
        (scene id, title, author name, created, votes).
      - A `/shares` gallery page: browse by scene or by recency/top, inline
        playback, upvote button (one vote per browser to start — no
        accounts yet).
      - Mobile compatible like every player surface.
      - Open questions: moderation/takedown story (user uploads of
        copyrighted-clip remixes), name/anon policy, vote spam protection.

## Done
- [x] Load fix verified in production: CI auto-deploys are live, the app
      serves the ~5KB icon-font subset and the landing preconnects to
      app.dub-off.com. If it still feels slow on a specific device/network,
      reopen with details.
- [x] Mobile compatibility pass — audited landing / scene select / casting /
      studio / screening at 375×812 with a stubbed mic through the full
      record→wrap flow. Fixed: screening wrap panel no longer overlays (and
      overflows) the short mobile video — score + actions render below it;
      title sizes and page paddings scale down on phones; landing title stays
      on one line. Real-device Safari check still worthwhile when convenient.
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
