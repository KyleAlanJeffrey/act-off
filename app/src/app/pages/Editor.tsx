import { useEffect, useMemo, useRef, useState } from "react";
import { parseSubtitles, slugify } from "../lib/subtitles";
import type { DraftCharacter, DraftLine } from "../lib/subtitles";
import { audioCtx } from "../lib/audio";
import EditorTimeline from "../components/EditorTimeline";
import type { Peaks, Trim } from "../components/EditorTimeline";
import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";

type Meta = { id: string; title: string; tagline: string; sourceUrl: string };
type Source = { kind: "file"; file: File; url: string; name: string } | {
  kind: "youtube";
  token: string;
  url: string;
  name: string;
};
type Builder = { ok: boolean; ytdlp: boolean } | null;

const CHAR_COLORS = ["#bd00ff", "#00eefc", "#94db00", "#ffd54a", "#ff8a65", "#7c9eff"];
const DRAFT_KEY = "dub-off-editor-draft";

const fmt = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(t).padStart(3, "0")}`;
};

export default function Editor({ onBack }: { onBack: () => void }) {
  const [builder, setBuilder] = useState<Builder>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [meta, setMeta] = useState<Meta>({ id: "", title: "", tagline: "", sourceUrl: "" });
  const [characters, setCharacters] = useState<DraftCharacter[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [sel, setSel] = useState<number>(-1);
  const [trim, setTrim] = useState<Trim | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [zoomMs, setZoomMs] = useState(10000);
  const [viewStart, setViewStart] = useState(0);
  const [ytUrl, setYtUrl] = useState("");
  const [busy, setBusy] = useState<"" | "fetch" | "build" | "push">("");
  const [log, setLog] = useState("");
  const [builtId, setBuiltId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [newChar, setNewChar] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const stopAtRef = useRef<number | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // ---- Builder availability (dev server only) ----
  useEffect(() => {
    fetch("/editor-api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setBuilder(j?.ok ? j : null))
      .catch(() => setBuilder(null));
  }, []);

  // ---- Draft autosave (video files can't persist — everything else does) ----
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      if (d.lines?.length || d.meta?.title) {
        setMeta(d.meta ?? meta);
        setCharacters(d.characters ?? []);
        setLines(d.lines ?? []);
        setTrim(d.trim ?? null);
        setRestored(true);
      }
    } catch {
      /* corrupt draft — start clean */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, characters, lines, trim }));
    }, 400);
    return () => clearTimeout(t);
  }, [meta, characters, lines, trim]);

  // ---- Playhead tracking + segment stop + view follow ----
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const ms = v.currentTime * 1000;
        setPlayhead(ms);
        setPlaying(!v.paused);
        if (stopAtRef.current !== null && ms >= stopAtRef.current) {
          v.pause();
          stopAtRef.current = null;
        }
        // Keep the zoom window trailing the playhead during playback
        if (!v.paused) {
          setViewStart((vs) =>
            ms > vs + zoomMs * 0.92 || ms < vs ? Math.max(0, ms - zoomMs * 0.1) : vs
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zoomMs]);

  // ---- Decode the clip's audio into waveform peaks for the timeline ----
  useEffect(() => {
    if (!source) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPeaks(null);
      try {
        const bytes =
          source.kind === "file"
            ? await source.file.arrayBuffer()
            : await (await fetch(source.url)).arrayBuffer();
        const buf = await audioCtx().decodeAudioData(bytes);
        const binMs = 20;
        const perBin = Math.max(1, Math.round(buf.sampleRate * (binMs / 1000)));
        const bins = new Float32Array(Math.ceil(buf.length / perBin));
        const stride = Math.max(1, Math.floor(perBin / 60));
        for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
          const data = buf.getChannelData(c);
          for (let i = 0; i < data.length; i += stride) {
            const a = Math.abs(data[i]);
            const b = Math.floor(i / perBin);
            if (a > bins[b]) bins[b] = a;
          }
        }
        const max = bins.reduce((m, v) => (v > m ? v : m), 0) || 1;
        for (let i = 0; i < bins.length; i++) bins[i] /= max;
        if (!cancelled) setPeaks({ bins, binMs });
      } catch {
        // No decodable audio track — the timeline still works, just without
        // a waveform. Empty peaks mean "done, nothing to draw".
        if (!cancelled) setPeaks({ bins: new Float32Array(0), binMs: 20 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const seek = (ms: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, ms) / 1000;
    // Bring the zoom window along when the target is off-screen
    setViewStart((vs) =>
      ms < vs || ms > vs + zoomMs ? Math.max(0, ms - zoomMs * 0.3) : vs
    );
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    stopAtRef.current = null;
    if (v.paused) void v.play();
    else v.pause();
  };
  const playRange = (startMs: number, endMs: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = startMs / 1000;
    stopAtRef.current = endMs;
    void v.play();
  };

  // ---- Line editing ----
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => {
    const start = Math.round(playhead);
    setLines((prev) => [
      ...prev,
      { characterId: characters[0]?.id ?? "", text: "", startMs: start, endMs: start + 2000 },
    ]);
    setSel(lines.length);
  };
  const sortLines = () => setLines((prev) => [...prev].sort((a, b) => a.startMs - b.startMs));

  // Keyboard: space play/pause, I/O set in/out on the selected line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = (e.shiftKey ? 100 : 1000) * (e.key === "ArrowLeft" ? -1 : 1);
        seek(playhead + step);
      } else if (sel >= 0 && (e.key === "i" || e.key === "I")) {
        updateLine(sel, { startMs: Math.round(playhead) });
      } else if (sel >= 0 && (e.key === "o" || e.key === "O")) {
        updateLine(sel, { endMs: Math.round(playhead) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Characters ----
  const addCharacter = () => {
    const name = newChar.trim();
    if (!name) return;
    const id = slugify(name);
    if (!id || characters.some((c) => c.id === id)) return;
    setCharacters((prev) => [...prev, { id, name, emoji: "🎭" }]);
    setNewChar("");
  };
  const charColor = (id: string) => {
    const i = characters.findIndex((c) => c.id === id);
    return i === -1 ? "#514255" : CHAR_COLORS[i % CHAR_COLORS.length];
  };

  // ---- Imports ----
  const importSubs = async (file: File) => {
    const parsed = parseSubtitles(await file.text());
    setLines(parsed.lines);
    setCharacters((prev) => {
      const known = new Set(prev.map((c) => c.id));
      return [...prev, ...parsed.characters.filter((c) => !known.has(c.id))];
    });
    setSel(-1);
  };
  const importPack = async (file: File) => {
    const pack = JSON.parse(await file.text());
    setMeta({
      id: pack.id?.startsWith("FILL") ? "" : (pack.id ?? ""),
      title: pack.title?.startsWith("FILL") ? "" : (pack.title ?? ""),
      tagline: pack.tagline ?? "",
      sourceUrl: pack.sourceUrl ?? "",
    });
    setTrim(
      typeof pack.trim?.startMs === "number" && typeof pack.trim?.endMs === "number"
        ? { startMs: pack.trim.startMs, endMs: pack.trim.endMs }
        : null
    );
    setCharacters(pack.characters ?? []);
    setLines(
      (pack.lines ?? []).map((l: DraftLine) => ({
        ...l,
        characterId: l.characterId === "FILL_IN" ? "" : l.characterId,
      }))
    );
    setSel(-1);
  };
  const pickVideo = (file: File) => {
    setSource({ kind: "file", file, url: URL.createObjectURL(file), name: file.name });
    setBuiltId(null);
  };

  // ---- Streaming helper for the dev API ----
  const stream = async (url: string, init: RequestInit): Promise<{ code: number; result?: Record<string, unknown> }> => {
    const res = await fetch(url, init);
    if (!res.body) throw new Error(await res.text());
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let pending = "";
    let code = 1;
    let result: Record<string, unknown> | undefined;
    const handle = (line: string) => {
      const exit = line.match(/^__EXIT__ (\d+)/);
      const resl = line.match(/^__RESULT__ (.*)/);
      if (exit) code = Number(exit[1]);
      else if (resl) result = JSON.parse(resl[1]);
      else if (line.trim()) setLog((p) => p + line + "\n");
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += dec.decode(value, { stream: true });
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      parts.forEach(handle);
    }
    if (pending) handle(pending);
    return { code, result };
  };

  const fetchYouTube = async () => {
    if (!ytUrl.trim()) return;
    setBusy("fetch");
    setLog("");
    try {
      const { code, result } = await stream("/editor-api/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: ytUrl.trim() }),
      });
      if (code !== 0 || !result) throw new Error("Fetch failed — see the log.");
      const token = String(result.token);
      const title = String(result.title ?? "");
      setSource({ kind: "youtube", token, url: `/editor-api/video?token=${token}`, name: title || "YouTube video" });
      setBuiltId(null);
      setMeta((m) => ({
        ...m,
        sourceUrl: ytUrl.trim(),
        title: m.title || title,
        id: m.id || slugify(title).split("-").slice(0, 5).join("-"),
      }));
      if (result.hasSubs) {
        const subsText = await (await fetch(`/editor-api/subs?token=${token}`)).text();
        const parsed = parseSubtitles(subsText);
        if (lines.length === 0) {
          setLines(parsed.lines);
          setCharacters((prev) => {
            const known = new Set(prev.map((c) => c.id));
            return [...prev, ...parsed.characters.filter((c) => !known.has(c.id))];
          });
        }
        setLog((p) => p + `\n✓ Subtitles loaded (${parsed.lines.length} cues).\n`);
      } else {
        setLog((p) => p + "\n⚠ No subtitles on this video — add lines by hand (I/O keys mark in/out).\n");
      }
    } catch (e) {
      setLog((p) => p + `\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
    } finally {
      setBusy("");
    }
  };

  // ---- Validate + pack assembly ----
  const problems = useMemo(() => {
    const errs: string[] = [];
    if (!/^[a-z0-9-]+$/.test(meta.id)) errs.push("Scene id must be kebab-case (a-z, 0-9, dashes).");
    if (!meta.title.trim()) errs.push("Title is required.");
    if (characters.length === 0) errs.push("Add at least one character.");
    if (lines.length === 0) errs.push("Add at least one line.");
    const charIds = new Set(characters.map((c) => c.id));
    lines.forEach((l, i) => {
      if (!l.text.trim()) errs.push(`Line ${i + 1} has no text.`);
      if (!charIds.has(l.characterId)) errs.push(`Line ${i + 1} needs a character.`);
      if (l.startMs >= l.endMs) errs.push(`Line ${i + 1}: start must be before end.`);
      if (trim && (l.startMs < trim.startMs || l.endMs > trim.endMs)) {
        errs.push(`Line ${i + 1} is outside the trim range.`);
      }
    });
    return errs;
  }, [meta, characters, lines, trim]);

  const buildPack = () => {
    const sorted = [...lines].sort((a, b) => a.startMs - b.startMs);
    return {
      id: meta.id,
      title: meta.title.trim(),
      tagline: meta.tagline.trim(),
      ...(meta.sourceUrl.trim() ? { sourceUrl: meta.sourceUrl.trim() } : {}),
      ...(trim ? { trim: { startMs: Math.round(trim.startMs), endMs: Math.round(trim.endMs) } } : {}),
      characters,
      lines: sorted.map(({ characterId, text, startMs, endMs }) => ({
        characterId,
        text: text.trim(),
        startMs,
        endMs,
      })),
    };
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(buildPack(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.id || "scene"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const compile = async () => {
    if (!source) return;
    setBusy("build");
    setBuiltId(null);
    setLog("");
    try {
      let token: string;
      if (source.kind === "youtube") {
        token = source.token;
      } else {
        setLog("Uploading video to the local builder…\n");
        const up = await fetch(`/editor-api/video?name=${encodeURIComponent(source.name)}`, {
          method: "PUT",
          body: source.file,
        });
        if (!up.ok) throw new Error(await up.text());
        token = (await up.json()).token;
      }
      const { code } = await stream("/editor-api/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pack: buildPack() }),
      });
      if (code === 0) {
        setBuiltId(meta.id);
        setLog((p) => p + "\n✓ Scene built and registered.\n");
      }
    } catch (e) {
      setLog((p) => p + `\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
    } finally {
      setBusy("");
    }
  };

  const pushToR2 = async () => {
    if (!builtId) return;
    setBusy("push");
    try {
      await stream("/editor-api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: builtId }),
      });
    } finally {
      setBusy("");
    }
  };

  const selLine = sel >= 0 ? lines[sel] : null;

  return (
    <div className="min-h-screen p-4 relative">
      <BgBlobs />
      <main className="relative z-10 max-w-6xl mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <button onClick={onBack} className="text-on-surface-variant hover:text-on-surface flex items-center gap-1 cursor-pointer">
            <Icon name="arrow_back" /> <span className="text-sm font-bold uppercase tracking-wider">Back</span>
          </button>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-tight">Scene editor</h1>
          <Chip color={builder ? "lime" : "dim"}>
            {builder ? "Local builder connected" : "No local builder — export only"}
          </Chip>
        </header>

        {restored && (
          <Card className="p-3 px-5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-on-surface-variant">
              Restored your last draft{source ? "" : " — re-select the video to preview"}.
            </p>
            <button
              className="text-xs font-bold uppercase tracking-wider text-error cursor-pointer hover:underline"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                setMeta({ id: "", title: "", tagline: "", sourceUrl: "" });
                setCharacters([]);
                setLines([]);
                setSel(-1);
                setRestored(false);
              }}
            >
              Clear draft
            </button>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
          {/* ---- Video + timeline ---- */}
          <Card active className="p-4 flex flex-col gap-3">
            {!source ? (
              <div className="flex flex-col gap-4 py-10 items-center text-center">
                <p className="font-display font-bold text-xl uppercase">Load the scene's video</p>
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 rounded-full border-3 border-secondary-container text-secondary-container font-bold uppercase tracking-wider text-sm py-3 px-8 hover:bg-secondary-container/10">
                    <Icon name="folder_open" /> Choose a video file
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && pickVideo(e.target.files[0])}
                  />
                </label>
                {builder?.ytdlp ? (
                  <div className="flex gap-2 w-full max-w-lg">
                    <input
                      value={ytUrl}
                      onChange={(e) => setYtUrl(e.target.value)}
                      placeholder="…or paste a YouTube link"
                      className="flex-1 bg-surface-container-lowest border-3 border-outline-variant rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-primary-container"
                    />
                    <NeonButton
                      variant="primary"
                      disabled={busy === "fetch" || !ytUrl.trim()}
                      onClick={() => void fetchYouTube()}
                    >
                      {busy === "fetch" ? "Fetching…" : "Fetch"}
                    </NeonButton>
                  </div>
                ) : builder ? (
                  <p className="text-xs text-on-surface-variant">
                    Want to paste YouTube links?{" "}
                    <code className="text-secondary-container">uv tool install "yt-dlp[default,curl-cffi]"</code>{" "}
                    and restart the dev server.
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant truncate max-w-[60%]">
                    {source.name}
                  </p>
                  <button
                    onClick={() => setSource(null)}
                    className="text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    Change video
                  </button>
                </div>
                <video
                  ref={videoRef}
                  src={source.url}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration * 1000)}
                  onClick={togglePlay}
                  className="mx-auto w-auto max-w-full max-h-[38vh] rounded-md border-2 border-outline-variant cursor-pointer bg-black"
                />

                {/* Overview: the whole clip, with the zoom window marked */}
                <div
                  className="relative h-4 bg-surface-container-lowest rounded-md border-2 border-outline-variant cursor-crosshair overflow-hidden"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    seek(((e.clientX - r.left) / r.width) * duration);
                  }}
                >
                  {lines.map((l, i) => (
                    <div
                      key={i}
                      className="absolute top-0.5 bottom-0.5 rounded-xs pointer-events-none"
                      style={{
                        left: `${(l.startMs / Math.max(1, duration)) * 100}%`,
                        width: `${Math.max(0.4, ((l.endMs - l.startMs) / Math.max(1, duration)) * 100)}%`,
                        background: charColor(l.characterId),
                        opacity: i === sel ? 1 : 0.5,
                      }}
                    />
                  ))}
                  {trim && (
                    <>
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-background/70 pointer-events-none"
                        style={{ width: `${(trim.startMs / Math.max(1, duration)) * 100}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 right-0 bg-background/70 pointer-events-none"
                        style={{ width: `${Math.max(0, 100 - (trim.endMs / Math.max(1, duration)) * 100)}%` }}
                      />
                    </>
                  )}
                  <div
                    className="absolute top-0 bottom-0 border-2 border-on-surface/60 rounded-sm pointer-events-none"
                    style={{
                      left: `${Math.min(100, (viewStart / Math.max(1, duration)) * 100)}%`,
                      width: `${Math.min(100 - Math.min(100, (viewStart / Math.max(1, duration)) * 100), (zoomMs / Math.max(1, duration)) * 100)}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-error pointer-events-none"
                    style={{ left: `${(playhead / Math.max(1, duration)) * 100}%` }}
                  />
                </div>

                {/* Zoomed waveform: drag edges to retime, drag body to move,
                    drag empty space to scrub, wheel to zoom/pan */}
                <EditorTimeline
                  peaks={peaks}
                  durationMs={duration}
                  playheadMs={playhead}
                  lines={lines}
                  sel={sel}
                  viewStartMs={viewStart}
                  zoomMs={zoomMs}
                  trim={trim}
                  charColor={charColor}
                  onSeek={seek}
                  onSelect={setSel}
                  onChangeLine={updateLine}
                  onChangeTrim={setTrim}
                  onView={(vs, z) => {
                    setViewStart(vs);
                    if (z !== undefined) setZoomMs(z);
                  }}
                />

                {/* Transport + selected-line timing bar */}
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <button onClick={togglePlay} className="cursor-pointer text-secondary-container">
                    <Icon name={playing ? "pause_circle" : "play_circle"} className="text-4xl" />
                  </button>
                  <span className="font-bold tabular-nums">{fmt(playhead)} / {fmt(duration)}</span>
                  <span className="inline-flex items-center gap-1">
                    <button onClick={() => setZoomMs((z) => Math.max(1500, z / 1.6))} className="ed-minibtn cursor-pointer" title="Zoom in">
                      <Icon name="zoom_in" className="text-base" />
                    </button>
                    <button onClick={() => setZoomMs((z) => Math.min(duration || 60000, z * 1.6))} className="ed-minibtn cursor-pointer" title="Zoom out">
                      <Icon name="zoom_out" className="text-base" />
                    </button>
                    <button onClick={() => { setZoomMs(duration || 60000); setViewStart(0); }} className="ed-minibtn cursor-pointer" title="Fit whole clip">
                      <Icon name="fit_width" className="text-base" />
                    </button>
                  </span>
                  {selLine ? (
                    <div className="flex items-center gap-2 flex-wrap ml-auto">
                      <Chip color="cyan">Line {sel + 1}</Chip>
                      <TimeCtl label="in" ms={selLine.startMs} onSet={() => updateLine(sel, { startMs: Math.round(playhead) })} onNudge={(d) => updateLine(sel, { startMs: Math.max(0, selLine.startMs + d) })} />
                      <TimeCtl label="out" ms={selLine.endMs} onSet={() => updateLine(sel, { endMs: Math.round(playhead) })} onNudge={(d) => updateLine(sel, { endMs: Math.max(0, selLine.endMs + d) })} />
                      <button
                        onClick={() => playRange(selLine.startMs, selLine.endMs)}
                        className="text-primary font-bold uppercase text-xs tracking-wider cursor-pointer flex items-center gap-1"
                      >
                        <Icon name="play_arrow" /> Preview
                      </button>
                    </div>
                  ) : (
                    <span className="text-on-surface-variant text-xs ml-auto">
                      Select a line to edit timing · space = play/pause · I/O = mark in/out
                    </span>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* ---- Scene info + characters ---- */}
          <div className="flex flex-col gap-4">
            <Card className="p-4 flex flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Scene</p>
              <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value, id: meta.id || slugify(e.target.value) })} placeholder="Title" className="ed-input" />
              <input value={meta.id} onChange={(e) => setMeta({ ...meta, id: e.target.value })} placeholder="scene-id (kebab-case)" className="ed-input font-mono text-sm" />
              <input value={meta.tagline} onChange={(e) => setMeta({ ...meta, tagline: e.target.value })} placeholder="Tagline (shows on the card)" className="ed-input" />
              <input value={meta.sourceUrl} onChange={(e) => setMeta({ ...meta, sourceUrl: e.target.value })} placeholder="Source URL (YouTube link)" className="ed-input text-sm" />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-on-surface-variant">
                  <span className="font-bold uppercase tracking-widest text-gold">Trim</span>{" "}
                  {trim ? (
                    <>keeps <span className="tabular-nums font-bold">{fmt(trim.startMs)} → {fmt(trim.endMs)}</span> — drag the gold handles</>
                  ) : (
                    "— whole clip ships. Set a range or use Auto."
                  )}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="ed-minibtn cursor-pointer"
                    disabled={!source}
                    onClick={() =>
                      setTrim((t) => ({
                        startMs: Math.round(Math.min(playhead, (t?.endMs ?? duration) - 1000)),
                        endMs: t?.endMs ?? Math.round(duration),
                      }))
                    }
                  >
                    ⌖ start here
                  </button>
                  <button
                    className="ed-minibtn cursor-pointer"
                    disabled={!source}
                    onClick={() =>
                      setTrim((t) => ({
                        startMs: t?.startMs ?? 0,
                        endMs: Math.round(Math.max(playhead, (t?.startMs ?? 0) + 1000)),
                      }))
                    }
                  >
                    ⌖ end here
                  </button>
                  <button
                    className="ed-minibtn cursor-pointer"
                    disabled={lines.length === 0}
                    onClick={() => {
                      const sorted = [...lines].sort((a, b) => a.startMs - b.startMs);
                      setTrim({
                        startMs: Math.max(0, sorted[0].startMs - 2000),
                        endMs: Math.round(Math.min(duration || Infinity, sorted[sorted.length - 1].endMs + 2000)),
                      });
                    }}
                  >
                    Auto (dialogue ±2s)
                  </button>
                  {trim && (
                    <button className="ed-minibtn cursor-pointer" onClick={() => setTrim(null)}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                <label className="ed-minibtn cursor-pointer">
                  <Icon name="subtitles" className="text-base" /> Import subs
                  <input type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => e.target.files?.[0] && void importSubs(e.target.files[0])} />
                </label>
                <label className="ed-minibtn cursor-pointer">
                  <Icon name="file_open" className="text-base" /> Open pack.json
                  <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && void importPack(e.target.files[0])} />
                </label>
                <button className="ed-minibtn cursor-pointer" onClick={exportJson} disabled={problems.length > 0}>
                  <Icon name="download" className="text-base" /> Export
                </button>
              </div>
            </Card>

            <Card className="p-4 flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Characters</p>
              {characters.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    value={c.emoji}
                    onChange={(e) => setCharacters((p) => p.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))}
                    className="w-11 text-center bg-surface-container-lowest border-2 border-outline-variant rounded-md py-1.5"
                  />
                  <input
                    value={c.name}
                    onChange={(e) => setCharacters((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="ed-input flex-1 py-1.5"
                  />
                  <span className="w-3 h-3 rounded-full flex-none" style={{ background: charColor(c.id) }} />
                  <button
                    onClick={() => setCharacters((p) => p.filter((_, j) => j !== i))}
                    className="text-on-surface-variant hover:text-error cursor-pointer"
                  >
                    <Icon name="close" className="text-base" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newChar}
                  onChange={(e) => setNewChar(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCharacter()}
                  placeholder="Add character…"
                  className="ed-input flex-1 py-1.5"
                />
                <button onClick={addCharacter} className="ed-minibtn cursor-pointer">
                  <Icon name="add" className="text-base" /> Add
                </button>
              </div>
            </Card>
          </div>
        </div>

        {/* ---- Lines ---- */}
        <Card className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
              Lines <span className="text-on-surface">({lines.length})</span>
            </p>
            <div className="flex gap-2">
              <button className="ed-minibtn cursor-pointer" onClick={sortLines}>
                <Icon name="sort" className="text-base" /> Sort by time
              </button>
              <button className="ed-minibtn cursor-pointer" onClick={addLine} disabled={!source}>
                <Icon name="add" className="text-base" /> Add line at playhead
              </button>
            </div>
          </div>
          {lines.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-6">
              Import subtitles, open a pack.json, or add lines by hand while scrubbing the video.
            </p>
          )}
          {lines.map((l, i) => (
            <div
              key={i}
              onClick={(e) => {
                setSel(i);
                const t = (e.target as HTMLElement).tagName;
                if (t !== "INPUT" && t !== "SELECT" && t !== "BUTTON") seek(l.startMs);
              }}
              className={`grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-2 rounded-md border-2 px-2 py-1.5 cursor-pointer ${
                i === sel ? "border-secondary-container bg-secondary-container/10" : "border-transparent hover:bg-surface-container-highest"
              }`}
            >
              <span className="text-xs text-on-surface-variant w-6 text-right tabular-nums">{i + 1}</span>
              <select
                value={l.characterId}
                onChange={(e) => updateLine(i, { characterId: e.target.value })}
                className="bg-surface-container-lowest border-2 rounded-md py-1 px-1.5 text-sm max-w-36"
                style={{ borderColor: l.characterId ? charColor(l.characterId) : "#ffb4ab" }}
              >
                <option value="">— who? —</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
              <input
                value={l.text}
                onChange={(e) => updateLine(i, { text: e.target.value })}
                placeholder="Line text"
                className="ed-input py-1 text-sm"
              />
              <span className="text-xs tabular-nums text-on-surface-variant whitespace-nowrap">
                {fmt(l.startMs)} → {fmt(l.endMs)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setSel(i); playRange(l.startMs, l.endMs); }}
                className="text-primary cursor-pointer"
                title="Preview"
              >
                <Icon name="play_circle" className="text-xl" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLines((p) => p.filter((_, j) => j !== i));
                  setSel(-1);
                }}
                className="text-on-surface-variant hover:text-error cursor-pointer"
                title="Delete"
              >
                <Icon name="delete" className="text-xl" />
              </button>
            </div>
          ))}
        </Card>

        {/* ---- Compile ---- */}
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant flex-1">
              Compile
            </p>
            {problems.length > 0 && (
              <span className="text-xs text-error font-bold">{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}</span>
            )}
            {builder ? (
              <>
                <NeonButton
                  variant="tertiary"
                  disabled={problems.length > 0 || !source || busy !== ""}
                  onClick={() => void compile()}
                >
                  <Icon name="movie" /> {busy === "build" ? "Building…" : "Build scene"}
                </NeonButton>
                {builtId && (
                  <>
                    <NeonButton variant="secondary" disabled={busy !== ""} onClick={() => void pushToR2()}>
                      <Icon name="cloud_upload" /> {busy === "push" ? "Pushing…" : "Push to R2"}
                    </NeonButton>
                    <NeonButton variant="primary" onClick={() => (window.location.href = "/solo")}>
                      <Icon name="play_arrow" /> Play it
                    </NeonButton>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-on-surface-variant">
                Export the pack.json, then on a machine with the repo:{" "}
                <code className="text-secondary-container">npm --prefix app run scene:pack -- video.mp4 pack.json</code>
              </p>
            )}
          </div>
          {log && (
            <pre
              ref={logRef}
              className="bg-surface-container-lowest border-2 border-outline-variant rounded-md p-3 text-xs leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap"
            >
              {log}
            </pre>
          )}
          {busy === "build" && (
            <p className="text-xs text-on-surface-variant">
              Dialogue separation (demucs) is the slow part — first run downloads the model. Keep this tab open.
            </p>
          )}
        </Card>
      </main>

      <style>{`
        .ed-input { background: var(--color-surface-container-lowest); border: 2px solid var(--color-outline-variant); border-radius: 10px; padding: 8px 12px; width: 100%; }
        .ed-input:focus { outline: none; border-color: var(--color-secondary-container); }
        .ed-minibtn { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border: 2px solid var(--color-outline-variant); border-radius: 999px; padding: 6px 14px; color: var(--color-on-surface-variant); }
        .ed-minibtn:hover:not(:disabled) { border-color: var(--color-secondary-container); color: var(--color-on-surface); }
        .ed-minibtn:disabled { opacity: .35; }
      `}</style>
    </div>
  );
}

function TimeCtl({
  label,
  ms,
  onSet,
  onNudge,
}: {
  label: string;
  ms: number;
  onSet: () => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button onClick={onSet} title={`Set ${label} to playhead (${label === "in" ? "I" : "O"})`} className="ed-minibtn cursor-pointer">
        ⌖ {label}
      </button>
      <button onClick={() => onNudge(-100)} className="cursor-pointer text-on-surface-variant hover:text-on-surface px-0.5">−.1</button>
      <span className="tabular-nums font-bold">{fmt(ms)}</span>
      <button onClick={() => onNudge(100)} className="cursor-pointer text-on-surface-variant hover:text-on-surface px-0.5">+.1</button>
    </span>
  );
}
