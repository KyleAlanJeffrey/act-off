import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene, Take } from "../types";
import { sceneAssetUrl } from "../types";
import { audioCtx, scheduleScreening } from "../lib/audio";
import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";
import { canShareFiles, downloadBlob, dubFilename, exportDub } from "../lib/export";
import { scoreDub } from "../lib/score";

type Props = {
  scene: Scene;
  originalBuffer: AudioBuffer;
  backgroundBuffer: AudioBuffer | null;
  vocalsBuffer: AudioBuffer | null;
  takes: Map<number, Take>;
  onBackToStudio: () => void;
  onNewScene: () => void;
};

export default function Screening({
  scene,
  originalBuffer,
  backgroundBuffer,
  vocalsBuffer,
  takes,
  onBackToStudio,
  onNewScene,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mixRef = useRef<{ stop: () => void } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const tickRef = useRef(0);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const cutRef = useRef<Blob | null>(null);

  // Computed once per takes-set; ~milliseconds of envelope math
  const dubScore = useMemo(
    () => scoreDub({ scene, vocals: vocalsBuffer, original: originalBuffer, takes }),
    [scene, vocalsBuffer, originalBuffer, takes]
  );

  const activeLine = scene.lines.find((l) => timeMs >= l.startMs && timeMs <= l.endMs + 350);
  const activeCharacter = activeLine
    ? scene.characters.find((c) => c.id === activeLine.characterId)
    : null;
  const dubbedCount = scene.lines.filter((l) => takes.get(l.index)?.buffer).length;

  const stop = () => {
    mixRef.current?.stop();
    mixRef.current = null;
    clearInterval(tickRef.current);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    setPlaying(false);
    setTimeMs(0);
  };

  useEffect(() => () => stop(), []);

  const play = async () => {
    stop();
    setEnded(false);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    const mix = scheduleScreening({
      original: originalBuffer,
      background: backgroundBuffer ?? undefined,
      vocals: vocalsBuffer ?? undefined,
      durationMs: scene.durationMs,
      lines: scene.lines.map((l) => ({
        startMs: l.startMs,
        endMs: l.endMs,
        take: takes.get(l.index)?.buffer,
      })),
    });
    mixRef.current = mix;
    // The video is decoration — if the browser refuses to play it (power
    // saving, autoplay policy), the premiere still runs on the audio clock.
    v.play().catch(() => {});
    setPlaying(true);
    const ac = audioCtx();
    // Interval (not rAF): keeps ticking when the tab is hidden, and the audio
    // clock keeps the timeline exact regardless of tick cadence.
    tickRef.current = window.setInterval(() => {
      const ms = (ac.currentTime - mix.startTime) * 1000;
      setTimeMs(Math.max(0, ms));
      if (ms >= scene.durationMs + 150) handleEnded();
    }, 100);
  };

  /** Renders the cut once, then reuses it for download/share. */
  const renderCut = async (): Promise<Blob | null> => {
    if (cutRef.current) return cutRef.current;
    stop();
    setExportError(null);
    setExportProgress(0);
    try {
      const blob = await exportDub({
        videoUrl: sceneAssetUrl(scene.id, "clip.mp4"),
        original: originalBuffer,
        background: backgroundBuffer ?? undefined,
        vocals: vocalsBuffer ?? undefined,
        durationMs: scene.durationMs,
        lines: scene.lines.map((l) => ({
          startMs: l.startMs,
          endMs: l.endMs,
          take: takes.get(l.index)?.buffer,
        })),
        onProgress: setExportProgress,
      });
      cutRef.current = blob;
      return blob;
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed — try again.");
      return null;
    } finally {
      setExportProgress(null);
    }
  };

  const downloadCut = async () => {
    const blob = await renderCut();
    if (blob) downloadBlob(blob, dubFilename(scene.id, blob.type));
  };

  const shareCut = async () => {
    const blob = await renderCut();
    if (!blob) return;
    const file = new File([blob], dubFilename(scene.id, blob.type), { type: blob.type });
    try {
      await navigator.share({ files: [file], title: `${scene.title} — Dub-Off cut` });
    } catch {
      // user dismissed the share sheet — nothing to clean up
    }
  };

  const handleEnded = () => {
    mixRef.current = null;
    clearInterval(tickRef.current);
    videoRef.current?.pause();
    setPlaying(false);
    setEnded(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative">
      <BgBlobs />
      <main className="relative z-10 max-w-4xl w-full flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <Chip color="pink" className="mb-2">The premiere</Chip>
            <h1 className="font-display font-extrabold text-3xl uppercase tracking-tight">
              {scene.title} <span className="text-primary">— your cut</span>
            </h1>
          </div>
          <Chip color={dubbedCount === scene.lines.length ? "lime" : "cyan"}>
            {dubbedCount}/{scene.lines.length} lines dubbed
          </Chip>
        </header>

        <Card active className="p-4 relative overflow-hidden">
          <div className="relative">
            <video
              ref={videoRef}
              src={sceneAssetUrl(scene.id, "clip.mp4")}
              muted
              playsInline
              preload="auto"
              className="w-full rounded-md border-2 border-outline-variant"
            />

            {/* Lower third */}
            {playing && activeLine && activeCharacter && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-center">
                <div className="bg-surface-container-lowest/90 backdrop-blur-md border-3 border-primary-container rounded-md px-6 py-3 max-w-xl text-center glow-primary">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">
                    {activeCharacter.emoji} {activeCharacter.name} · voiced by you
                  </p>
                  <p className="font-display font-bold text-xl leading-tight">“{activeLine.text}”</p>
                </div>
              </div>
            )}

            {/* Curtain / start overlay */}
            {!playing && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-5 rounded-md">
                {exportProgress !== null ? (
                  <>
                    <p className="font-display font-extrabold text-3xl uppercase text-secondary-container">
                      Rendering your cut… {Math.round(exportProgress * 100)}%
                    </p>
                    <div className="w-72 h-2.5 bg-surface-container-lowest rounded-full border-2 border-outline-variant overflow-hidden">
                      <div
                        className="h-full bg-secondary-container transition-[width] duration-200"
                        style={{ width: `${exportProgress * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      Renders in real time — keep this tab visible.
                    </p>
                  </>
                ) : ended ? (
                  <>
                    <p className="font-display font-extrabold text-4xl uppercase text-gold">That's a wrap!</p>
                    {dubScore && (
                      <div className="flex flex-col items-center gap-2 -mt-2">
                        <p className="font-display font-extrabold text-2xl uppercase">
                          Voice match:{" "}
                          <span className="text-secondary-container">{dubScore.total}%</span>
                        </p>
                        <Chip color="lime">{dubScore.grade}</Chip>
                        <div className="flex gap-1.5 flex-wrap justify-center max-w-md">
                          {dubScore.lines.map((l) => (
                            <span
                              key={l.lineIndex}
                              title={`Line ${l.lineIndex + 1}: “${scene.lines[l.lineIndex]?.text}” — ${l.score}%`}
                              className="flex flex-col items-center gap-1"
                            >
                              <span className="w-3.5 h-10 bg-surface-container-lowest border-2 border-outline-variant rounded-full overflow-hidden flex flex-col justify-end">
                                <span
                                  className={l.score >= 65 ? "bg-tertiary" : l.score >= 40 ? "bg-secondary-container" : "bg-error"}
                                  style={{ height: `${Math.max(8, l.score)}%` }}
                                />
                              </span>
                              <span className="text-[10px] text-on-surface-variant tabular-nums">{l.lineIndex + 1}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-4 flex-wrap justify-center max-w-xl">
                      <NeonButton variant="primary" onClick={() => void play()}>
                        <Icon name="replay" /> Watch again
                      </NeonButton>
                      <NeonButton variant="tertiary" onClick={() => void downloadCut()}>
                        <Icon name="download" /> Download the cut
                      </NeonButton>
                      {canShareFiles() && (
                        <NeonButton variant="secondary" onClick={() => void shareCut()}>
                          <Icon name="ios_share" /> Share
                        </NeonButton>
                      )}
                      <NeonButton variant="secondary" onClick={onBackToStudio}>
                        <Icon name="mic" /> Re-record lines
                      </NeonButton>
                      <NeonButton variant="ghost" onClick={onNewScene}>
                        <Icon name="movie_filter" /> New scene
                      </NeonButton>
                    </div>
                    {exportError && (
                      <p className="text-error text-sm font-bold">{exportError}</p>
                    )}
                  </>
                ) : (
                  <NeonButton variant="tertiary" onClick={() => void play()} className="py-5 px-12 text-lg">
                    <Icon name="play_arrow" className="text-3xl" /> Roll film
                  </NeonButton>
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="relative h-2.5 bg-surface-container-lowest rounded-full border-2 border-outline-variant mt-4">
            <div
              className="absolute top-0 left-0 h-full bg-primary-container rounded-full transition-[width] duration-100"
              style={{ width: `${Math.min(100, (timeMs / scene.durationMs) * 100)}%` }}
            />
          </div>
        </Card>

        {playing && (
          <div className="flex justify-center">
            <NeonButton variant="ghost" onClick={stop}>
              <Icon name="stop" /> Stop
            </NeonButton>
          </div>
        )}
      </main>
    </div>
  );
}
