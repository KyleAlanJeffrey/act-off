interface Env {
  ASSETS: { fetch: typeof fetch };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/health") {
        return Response.json({ ok: true });
      }
      // Party-mode endpoints (lobby DO, R2 takes) land here later.
      return Response.json(
        { error: "Party mode is not built yet — Solo Show runs fully client-side." },
        { status: 501 }
      );
    }

    return env.ASSETS.fetch(request);
  },
};
