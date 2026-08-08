import { useEffect, useRef, useState } from "react";
import type { Scene, Take } from "../types";
import { sceneAssetUrl } from "../types";
import { scheduleScreening } from "../lib/audio";
import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";

type Props = {
  scene: Scene;
  originalBuffer: AudioBuffer;
  takes: Map<number, Take>;
  onBackToStudio: () => void;
  onNewScene: () => void;
};

export default function Screening({ scene, originalBuffer, takes, onBackToStudio, onNewScene }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mixRef = useRef<{ stop: () => void } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const rafRef = useRef(0);

  const activeLine = scene.lines.find((l) => timeMs >= l.startMs && timeMs <= l.endMs + 350);
  const activeCharacter = activeLine
    ? scene.characters.find((c) => c.id === activeLine.characterId)
    : null;
  const dubbedCount = scene.lines.filter((l) => takes.get(l.index)?.buffer).length;

  const stop = () => {
    mixRef.current?.stop();
    mixRef.current = null;
    cancelAnimationFrame(rafRef.current);
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
    mixRef.current = scheduleScreening(
      originalBuffer,
      scene.lines.map((l) => ({
        startMs: l.startMs,
        endMs: l.endMs,
        take: takes.get(l.index)?.buffer,
      }))
    );
    await v.play();
    setPlaying(true);
    const tick = () => {
      setTimeMs(v.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const handleEnded = () => {
    mixRef.current = null;
    cancelAnimationFrame(rafRef.current);
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
              onEnded={handleEnded}
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
                {ended ? (
                  <>
                    <p className="font-display font-extrabold text-4xl uppercase text-gold">That's a wrap!</p>
                    <div className="flex gap-4 flex-wrap justify-center">
                      <NeonButton variant="primary" onClick={() => void play()}>
                        <Icon name="replay" /> Watch again
                      </NeonButton>
                      <NeonButton variant="secondary" onClick={onBackToStudio}>
                        <Icon name="mic" /> Re-record lines
                      </NeonButton>
                      <NeonButton variant="tertiary" onClick={onNewScene}>
                        <Icon name="movie_filter" /> New scene
                      </NeonButton>
                    </div>
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
