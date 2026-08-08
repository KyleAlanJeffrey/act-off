import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene, Take } from "../types";
import { sceneAssetUrl } from "../types";
import { blobToAudioBuffer, MicSession, playSegment } from "../lib/audio";
import Waveform from "../components/Waveform";
import { BgBlobs, Card, Chip, Icon, LevelMeter, NeonButton } from "../components/ui";

type Props = {
  scene: Scene;
  originalBuffer: AudioBuffer;
  mic: MicSession;
  takes: Map<number, Take>;
  onTake: (lineIndex: number, take: Take) => void;
  onWrap: () => void;
};

type Transport =
  | { kind: "idle" }
  | { kind: "countdown"; n: number }
  | { kind: "recording"; startedAt: number }
  | { kind: "playingOriginal" }
  | { kind: "playingTake" };

export default function Studio({ scene, originalBuffer, mic, takes, onTake, onWrap }: Props) {
  const [focused, setFocused] = useState(0);
  const [transport, setTransport] = useState<Transport>({ kind: "idle" });
  const [origProgress, setOrigProgress] = useState(0);
  const [takeProgress, setTakeProgress] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const playerRef = useRef<{ stop: () => void } | null>(null);
  const timersRef = useRef<number[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const line = scene.lines[focused];
  const character = scene.characters.find((c) => c.id === line.characterId)!;
  const take = takes.get(line.index);
  const lineDurMs = line.endMs - line.startMs;
  const capMs = lineDurMs * 2 + 2000;
  const recordedCount = scene.lines.filter((l) => takes.get(l.index)?.buffer).length;
  const allDone = recordedCount === scene.lines.length;

  const linesByCharacter = useMemo(
    () =>
      scene.characters.map((c) => ({
        character: c,
        lines: scene.lines.filter((l) => l.characterId === c.id),
      })),
    [scene]
  );

  const clearTimers = () => {
    for (const t of timersRef.current) clearInterval(t);
    timersRef.current = [];
  };

  const stopAll = () => {
    playerRef.current?.stop();
    playerRef.current = null;
    clearTimers();
    setOrigProgress(0);
    setTakeProgress(0);
    setTransport({ kind: "idle" });
  };

  useEffect(() => () => stopAll(), []);

  const focusLine = (i: number) => {
    if (transport.kind === "recording" || transport.kind === "countdown") return;
    stopAll();
    setFocused(i);
    const v = videoRef.current;
    if (v) v.currentTime = scene.lines[i].startMs / 1000;
  };

  const playOriginal = () => {
    stopAll();
    setTransport({ kind: "playingOriginal" });
    playerRef.current = playSegment(originalBuffer, {
      startMs: line.startMs,
      endMs: line.endMs,
      onProgress: setOrigProgress,
      onEnded: () => setTransport({ kind: "idle" }),
    });
  };

  const playTake = () => {
    if (!take?.buffer) return;
    stopAll();
    setTransport({ kind: "playingTake" });
    playerRef.current = playSegment(take.buffer, {
      onProgress: setTakeProgress,
      onEnded: () => setTransport({ kind: "idle" }),
    });
  };

  const beginRecording = () => {
    stopAll();
    let n = 3;
    setTransport({ kind: "countdown", n });
    const interval = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setTransport({ kind: "countdown", n });
        return;
      }
      clearTimers();
      mic.startRecording();
      const startedAt = performance.now();
      setTransport({ kind: "recording", startedAt });
      const meter = window.setInterval(() => {
        setMicLevel(mic.level());
        const el = performance.now() - startedAt;
        setElapsedMs(el);
        if (el >= capMs) void finishRecording(startedAt);
      }, 50);
      timersRef.current.push(meter);
    }, 700);
    timersRef.current.push(interval);
  };

  const finishRecording = async (_startedAt: number) => {
    clearTimers();
    setTransport({ kind: "idle" });
    setElapsedMs(0);
    const blob = await mic.stopRecording();
    const buffer = await blobToAudioBuffer(blob);
    onTake(line.index, { lineIndex: line.index, state: "recorded", blob, buffer });
  };

  const isRecording = transport.kind === "recording";
  const isCountdown = transport.kind === "countdown";

  return (
    <div className="min-h-screen p-6 relative">
      <BgBlobs />
      <main className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-6 items-start">
        {/* Left rail — line checklist */}
        <Card className="p-4 flex flex-col gap-4 lg:sticky top-6 order-2 lg:order-none">
          <div className="flex items-center justify-between">
            <p className="font-bold text-xs uppercase tracking-widest text-on-surface-variant">Your lines</p>
            <Chip color={allDone ? "lime" : "cyan"}>{recordedCount}/{scene.lines.length}</Chip>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
            {linesByCharacter.map(({ character: c, lines }) => (
              <div key={c.id}>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                  {c.emoji} {c.name}
                </p>
                <div className="flex flex-col gap-1.5">
                  {lines.map((l) => {
                    const done = !!takes.get(l.index)?.buffer;
                    const isFocused = l.index === focused;
                    return (
                      <button
                        key={l.index}
                        onClick={() => focusLine(l.index)}
                        className={`text-left text-sm rounded-full px-3 py-1.5 border-2 flex items-center gap-2 cursor-pointer transition-colors ${
                          isFocused
                            ? "border-secondary-container bg-secondary-container/15 text-on-surface"
                            : "border-transparent hover:bg-surface-container-highest text-on-surface-variant"
                        }`}
                      >
                        <Icon
                          name={done ? "check_circle" : "radio_button_unchecked"}
                          className={`text-base ${done ? "text-tertiary" : "text-outline"}`}
                        />
                        <span className="truncate">
                          {l.index + 1}. {l.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <NeonButton variant="tertiary" disabled={!allDone} onClick={onWrap} className="w-full">
            That's a wrap <Icon name="movie" />
          </NeonButton>
          {!allDone && (
            <p className="text-xs text-on-surface-variant text-center -mt-2">
              Record every line to wrap.
            </p>
          )}
        </Card>

        {/* Center — focused line */}
        <Card active className="p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden order-1 lg:order-none">
          {isCountdown && (
            <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm flex items-center justify-center">
              <span className="font-display font-extrabold text-9xl text-secondary-container animate-ping-slow">
                {(transport as { n: number }).n}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Chip color="pink" className="text-sm">
              Now voicing: {character.emoji} {character.name}
            </Chip>
            <span className="text-on-surface-variant text-sm font-bold">
              Line {line.index + 1} of {scene.lines.length}
            </span>
          </div>

          <p className="font-display font-bold text-3xl md:text-4xl leading-snug text-center py-4">
            “{line.text}”
          </p>

          {/* Original */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Original delivery · {(lineDurMs / 1000).toFixed(1)}s
              </p>
              <button
                onClick={transport.kind === "playingOriginal" ? stopAll : playOriginal}
                className="text-secondary-container flex items-center gap-1 text-sm font-bold uppercase tracking-wider cursor-pointer hover:opacity-80"
              >
                <Icon name={transport.kind === "playingOriginal" ? "stop_circle" : "play_circle"} className="text-2xl" />
                {transport.kind === "playingOriginal" ? "Stop" : "Listen"}
              </button>
            </div>
            <div className="bg-surface-container-low rounded-md border-2 border-outline-variant p-3">
              <Waveform
                buffer={originalBuffer}
                startMs={line.startMs}
                endMs={line.endMs}
                progress={origProgress}
                color="#00eefc"
                dimColor="#313153"
              />
            </div>
          </div>

          {/* Your take */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Your take</p>
              {take?.buffer && !isRecording && (
                <button
                  onClick={transport.kind === "playingTake" ? stopAll : playTake}
                  className="text-primary flex items-center gap-1 text-sm font-bold uppercase tracking-wider cursor-pointer hover:opacity-80"
                >
                  <Icon name={transport.kind === "playingTake" ? "stop_circle" : "play_circle"} className="text-2xl" />
                  {transport.kind === "playingTake" ? "Stop" : "Play my take"}
                </button>
              )}
            </div>
            <div
              className={`bg-surface-container-low rounded-md border-2 p-3 transition-colors ${
                isRecording ? "border-error glow-error" : "border-outline-variant"
              }`}
            >
              {isRecording ? (
                <div className="h-16 flex items-center justify-center gap-4">
                  <span className="w-3 h-3 rounded-full bg-error animate-pulse" />
                  <LevelMeter level={micLevel} />
                  <span className="font-display font-bold text-error tabular-nums">
                    {(elapsedMs / 1000).toFixed(1)}s / {(capMs / 1000).toFixed(1)}s
                  </span>
                </div>
              ) : take?.buffer ? (
                <Waveform buffer={take.buffer} progress={takeProgress} color="#ecb2ff" dimColor="#313153" />
              ) : (
                <div className="h-16 flex items-center justify-center text-on-surface-variant text-sm">
                  No take yet — smash that record button.
                </div>
              )}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-4 pt-2">
            {isRecording ? (
              <NeonButton variant="danger" onClick={() => void finishRecording(0)} className="py-4 px-10 text-base">
                <Icon name="stop" className="text-2xl" /> Stop
              </NeonButton>
            ) : (
              <NeonButton variant="danger" onClick={beginRecording} disabled={isCountdown} className="py-4 px-10 text-base">
                <Icon name="fiber_manual_record" className="text-2xl" />
                {take?.buffer ? "Re-record" : "Record take"}
              </NeonButton>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => focusLine(Math.max(0, focused - 1))}
              disabled={focused === 0}
              className="text-on-surface-variant hover:text-on-surface disabled:opacity-30 flex items-center gap-1 cursor-pointer text-sm font-bold uppercase tracking-wider"
            >
              <Icon name="arrow_back" /> Prev
            </button>
            <button
              onClick={() => focusLine(Math.min(scene.lines.length - 1, focused + 1))}
              disabled={focused === scene.lines.length - 1}
              className="text-on-surface-variant hover:text-on-surface disabled:opacity-30 flex items-center gap-1 cursor-pointer text-sm font-bold uppercase tracking-wider"
            >
              Next <Icon name="arrow_forward" />
            </button>
          </div>
        </Card>

        {/* Right rail — scene context */}
        <Card className="p-4 flex flex-col gap-4 lg:sticky top-6 order-3 lg:order-none">
          <p className="font-bold text-xs uppercase tracking-widest text-on-surface-variant">
            {scene.title}
          </p>
          <video
            ref={videoRef}
            src={sceneAssetUrl(scene.id, "clip.mp4")}
            muted
            playsInline
            preload="auto"
            className="w-full rounded-md border-2 border-outline-variant"
          />
          <div className="relative h-3 bg-surface-container-lowest rounded-full border-2 border-outline-variant">
            {scene.lines.map((l) => (
              <button
                key={l.index}
                onClick={() => focusLine(l.index)}
                title={l.text}
                className={`absolute top-0 h-full rounded-full cursor-pointer transition-colors ${
                  l.index === focused ? "bg-secondary-container" : takes.get(l.index)?.buffer ? "bg-tertiary/70" : "bg-outline-variant"
                }`}
                style={{
                  left: `${(l.startMs / scene.durationMs) * 100}%`,
                  width: `${Math.max(2, ((l.endMs - l.startMs) / scene.durationMs) * 100)}%`,
                }}
              />
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">
            The focused line is <span className="text-secondary-container font-bold">cyan</span>; recorded lines turn{" "}
            <span className="text-tertiary font-bold">lime</span>. Take your time — solo shows have no clock.
          </p>
        </Card>
      </main>
    </div>
  );
}
