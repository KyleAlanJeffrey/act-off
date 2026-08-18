// Minimal R2 surface we use — the shared tsconfig serves the DOM app, so
// pulling in @cloudflare/workers-types globally would clash with lib.dom.
interface R2ObjectHead {
  size: number;
  httpEtag: string;
}
interface R2ObjectBody extends R2ObjectHead {
  body: ReadableStream;
}
interface R2Bucket {
  head(key: string): Promise<R2ObjectHead | null>;
  get(
    key: string,
    opts?: { range?: { offset: number; length: number } }
  ): Promise<R2ObjectBody | null>;
}

interface Env {
  ASSETS: { fetch: typeof fetch };
  SCENES: R2Bucket;
}

const SCENE_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4a: "audio/mp4",
  json: "application/json",
  jpg: "image/jpeg",
};

/**
 * Serves a scene file from R2, honoring single-range requests —
 * <video> seeking needs 206 responses.
 */
async function serveSceneFromR2(request: Request, env: Env, key: string): Promise<Response> {
  const ext = key.split(".").pop() ?? "";
  const contentType = SCENE_TYPES[ext] ?? "application/octet-stream";
  const baseHeaders = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  };

  const rangeHeader = request.headers.get("range");
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] !== "" || match[2] !== "")) {
    const head = await env.SCENES.head(key);
    if (!head) return new Response("Not found", { status: 404 });
    const size = head.size;
    const start = match[1] === "" ? size - Number(match[2]) : Number(match[1]);
    const end = match[1] !== "" && match[2] !== "" ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start < 0 || start > end || start >= size) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    const object = await env.SCENES.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-length": `${end - start + 1}`,
        "content-range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const object = await env.SCENES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { ...baseHeaders, "content-length": `${object.size}`, etag: object.httpEtag },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Scene media: local dev has the files in public/ (served via ASSETS);
    // CI-built deploys don't (media is gitignored), so fall back to R2 —
    // populated by `npm run scene:push`.
    if (url.pathname.startsWith("/scenes/")) {
      const assetRes = await env.ASSETS.fetch(request);
      const isSpaFallback = (assetRes.headers.get("content-type") ?? "").includes("text/html");
      if (assetRes.status < 400 && !isSpaFallback) return assetRes;
      return serveSceneFromR2(request, env, decodeURIComponent(url.pathname.slice("/scenes/".length)));
    }

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
