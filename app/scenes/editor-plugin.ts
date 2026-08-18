// Dev-only Vite plugin backing the in-app scene editor (/editor): the
// browser can't run ffmpeg/demucs, so the dev server exposes a tiny API
// that runs the existing CLI tools on this machine.
//
//   PUT  /editor-api/video?name=clip.mp4   raw bytes -> { token }
//   POST /editor-api/fetch { url }         -> yt-dlp download (streamed log,
//                                             ends with __RESULT__ {token,…})
//   GET  /editor-api/video?token=…         -> the fetched video (range-aware)
//   GET  /editor-api/subs?token=…          -> the fetched subtitles as text
//   POST /editor-api/build { token, pack } -> streamed build-pack.mjs log
//   POST /editor-api/push  { id }          -> streamed push-scenes.mjs log
//   GET  /editor-api/health                -> { ok: true, ytdlp: boolean }
//
// Production builds never include this — the editor detects the missing
// API and falls back to "download pack.json + run the CLI".
import { spawn, execFileSync } from "node:child_process";
import {
  createReadStream, createWriteStream, mkdtempSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const uploads = new Map<string, string>(); // token -> tmp video path
const subs = new Map<string, string>(); // token -> subtitle text (YouTube fetches)

const hasYtDlp = () => {
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 4_000_000) reject(new Error("body too large"));
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Runs a node script, streaming stdout+stderr into the response. */
function streamScript(
  res: ServerResponse,
  root: string,
  script: string,
  args: string[],
  onDone?: () => void
) {
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-cache",
  });
  const child = spawn(process.execPath, [join(root, script), ...args], { cwd: root });
  child.stdout.on("data", (d) => res.write(d));
  child.stderr.on("data", (d) => res.write(d));
  child.on("close", (code) => {
    res.end(`\n__EXIT__ ${code ?? 1}\n`);
    onDone?.();
  });
  child.on("error", (e) => {
    res.end(`\n${String(e)}\n__EXIT__ 1\n`);
    onDone?.();
  });
}

export function sceneEditorApi(): Plugin {
  return {
    name: "dub-off-scene-editor-api",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      server.middlewares.use("/editor-api", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (req.method === "GET" && url.pathname === "/health") {
          return json(res, 200, { ok: true, ytdlp: hasYtDlp() });
        }

        // Download a YouTube video (+ subtitles/auto-captions) with yt-dlp.
        if (req.method === "POST" && url.pathname === "/fetch") {
          void readJson(req)
            .then(({ url: videoUrl }) => {
              const target = String(videoUrl ?? "");
              if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(target)) {
                return json(res, 400, { error: "Pass a youtube.com / youtu.be URL" });
              }
              if (!hasYtDlp()) {
                return json(res, 400, { error: "yt-dlp not found — brew install yt-dlp, then retry" });
              }
              const dir = mkdtempSync(join(tmpdir(), "dub-off-editor-"));
              res.writeHead(200, {
                "content-type": "text/plain; charset=utf-8",
                "cache-control": "no-cache",
              });
              const child = spawn("yt-dlp", [
                "-f", "bv*[height<=720]+ba/b[height<=720]/b",
                "--merge-output-format", "mp4",
                "--no-playlist",
                "--write-subs", "--write-auto-subs",
                "--sub-langs", "en.*,en",
                "--convert-subs", "srt",
                "--no-simulate", "--print", "before_dl:__TITLE__ %(title)s",
                "-o", join(dir, "source.%(ext)s"),
                target,
              ]);
              let title = "";
              child.stdout.on("data", (d: Buffer) => {
                const line = d.toString();
                const m = line.match(/__TITLE__ (.*)/);
                if (m) title = m[1].trim();
                res.write(d);
              });
              child.stderr.on("data", (d) => res.write(d));
              child.on("close", (code) => {
                if (code !== 0) {
                  rmSync(dir, { recursive: true, force: true });
                  return res.end(`\n__EXIT__ ${code ?? 1}\n`);
                }
                const files = readdirSync(dir);
                const video = files.find((f) => /\.(mp4|mkv|webm)$/.test(f));
                if (!video) {
                  rmSync(dir, { recursive: true, force: true });
                  return res.end(`\nNo video file produced.\n__EXIT__ 1\n`);
                }
                const token = randomUUID();
                uploads.set(token, join(dir, video));
                const srt = files.find((f) => f.endsWith(".srt"));
                if (srt) subs.set(token, readFileSync(join(dir, srt), "utf8"));
                res.end(
                  `\n__RESULT__ ${JSON.stringify({ token, title, hasSubs: !!srt })}\n__EXIT__ 0\n`
                );
              });
              child.on("error", (e) => res.end(`\n${String(e)}\n__EXIT__ 1\n`));
            })
            .catch((e) => json(res, 400, { error: String(e) }));
          return;
        }

        // Serve a fetched video back to the editor's <video>, with ranges.
        if (req.method === "GET" && url.pathname === "/video") {
          const path = uploads.get(url.searchParams.get("token") ?? "");
          if (!path) return json(res, 404, { error: "unknown token" });
          const size = statSync(path).size;
          const type = path.endsWith(".webm") ? "video/webm" : "video/mp4";
          const range = (req.headers.range ?? "").match(/^bytes=(\d*)-(\d*)$/);
          if (range && (range[1] !== "" || range[2] !== "")) {
            const start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
            const end = range[1] !== "" && range[2] !== "" ? Math.min(Number(range[2]), size - 1) : size - 1;
            if (start < 0 || start > end || start >= size) {
              res.writeHead(416, { "content-range": `bytes */${size}` });
              return res.end();
            }
            res.writeHead(206, {
              "content-type": type,
              "accept-ranges": "bytes",
              "content-length": end - start + 1,
              "content-range": `bytes ${start}-${end}/${size}`,
            });
            return createReadStream(path, { start, end }).pipe(res);
          }
          res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
          return createReadStream(path).pipe(res);
        }

        if (req.method === "GET" && url.pathname === "/subs") {
          const text = subs.get(url.searchParams.get("token") ?? "");
          if (text === undefined) return json(res, 404, { error: "no subtitles for token" });
          res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
          return res.end(text);
        }

        if (req.method === "PUT" && url.pathname === "/video") {
          const ext = extname(url.searchParams.get("name") ?? "").toLowerCase() || ".mp4";
          if (!/^\.[a-z0-9]{1,5}$/.test(ext)) return json(res, 400, { error: "bad extension" });
          const dir = mkdtempSync(join(tmpdir(), "dub-off-editor-"));
          const path = join(dir, `source${ext}`);
          const out = createWriteStream(path);
          req.pipe(out);
          out.on("finish", () => {
            const token = randomUUID();
            uploads.set(token, path);
            json(res, 200, { token });
          });
          out.on("error", () => json(res, 500, { error: "write failed" }));
          return;
        }

        if (req.method === "POST" && url.pathname === "/build") {
          void readJson(req)
            .then(({ token, pack }) => {
              const video = uploads.get(String(token));
              if (!video) return json(res, 400, { error: "unknown video token — re-select the file" });
              // The upload sticks around for the session so tweak-and-rebuild
              // doesn't re-transfer the video.
              const packPath = join(video, "..", "pack.json");
              writeFileSync(packPath, JSON.stringify(pack, null, 2));
              streamScript(res, root, "scenes/build-pack.mjs", [video, packPath]);
            })
            .catch((e) => json(res, 400, { error: String(e) }));
          return;
        }

        if (req.method === "POST" && url.pathname === "/push") {
          void readJson(req)
            .then(({ id }) => {
              if (!/^[a-z0-9-]+$/.test(String(id))) return json(res, 400, { error: "bad scene id" });
              streamScript(res, root, "scenes/push-scenes.mjs", [String(id)]);
            })
            .catch((e) => json(res, 400, { error: String(e) }));
          return;
        }

        json(res, 404, { error: "not found" });
      });
    },
  };
}
