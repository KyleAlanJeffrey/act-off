import { useEffect, useRef, useState } from "react";
import type { Scene } from "../types";
import { MicSession } from "../lib/audio";
import { BgBlobs, Card, Chip, Icon, LevelMeter, NeonButton } from "../components/ui";

type Props = {
  scenes: Scene[];
  mic: MicSession | null;
  onMicReady: (mic: MicSession) => void;
  onPick: (scene: Scene) => void;
  onBack: () => void;
};

export default function SceneSelect({ scenes, mic, onMicReady, onPick, onBack }: Props) {
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!mic) return;
    const tick = () => {
      setLevel(mic.level());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mic]);

  const requestMic = async () => {
    try {
      onMicReady(await MicSession.open());
      setMicError(null);
    } catch {
      setMicError("Mic access denied — allow microphone access and try again.");
    }
  };

  // If the browser already granted mic access on a previous visit, open the
  // session immediately instead of making the player click the button again.
  useEffect(() => {
    if (mic) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (status.state === "granted" && !cancelled) {
          onMicReady(await MicSession.open());
        }
      } catch {
        // Permissions API unavailable (or query unsupported) — keep the button.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mic]);

  return (
    <div className="min-h-screen p-8 relative">
      <BgBlobs />
      <main className="relative z-10 max-w-4xl mx-auto flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <button onClick={onBack} className="text-on-surface-variant hover:text-on-surface flex items-center gap-1 cursor-pointer">
            <Icon name="arrow_back" /> <span className="text-sm font-bold uppercase tracking-wider">Back</span>
          </button>
          <Chip color="lime">Solo Show</Chip>
        </header>

        <div>
          <h1 className="font-display font-extrabold text-4xl uppercase tracking-tight">
            Pick tonight's scene
          </h1>
          <p className="text-on-surface-variant mt-2">
            You're playing <span className="text-primary font-bold">every character</span>. Warm up.
          </p>
        </div>

        <Card active={!!mic} className="p-5 flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full border-3 flex items-center justify-center ${mic ? "border-tertiary bg-tertiary/20" : "border-outline-variant bg-surface-container-highest"}`}>
              <Icon name={mic ? "mic" : "mic_off"} className={mic ? "text-tertiary" : "text-on-surface-variant"} />
            </div>
            <div>
              <p className="font-bold text-sm uppercase tracking-wider">Mic check</p>
              <p className="text-xs text-on-surface-variant">
                {mic ? "Say something — the meter should dance." : "Needed before you can hit the studio."}
              </p>
            </div>
          </div>
          {mic ? (
            <LevelMeter level={level} className="ml-auto" />
          ) : (
            <NeonButton variant="secondary" onClick={requestMic} className="ml-auto">
              Enable mic
            </NeonButton>
          )}
          {micError && <p className="w-full text-error text-sm font-bold">{micError}</p>}
        </Card>

        {scenes.length === 0 && (
          <Card className="p-6 text-center">
            <p className="font-bold">No scenes built yet.</p>
            <p className="text-sm text-on-surface-variant mt-2">
              Build one from a clip on this machine:{" "}
              <code className="text-secondary-container">npm run scene:pack -- clip.mp4 pack.json</code>{" "}
              (see the README).
            </p>
          </Card>
        )}
        <div className="grid md:grid-cols-3 gap-6">
          {scenes.map((scene) => (
            <SceneCard key={scene.id} scene={scene} locked={false} onPick={() => mic && onPick(scene)} dimmed={!mic} />
          ))}
          <SceneCard locked onPick={() => {}} dimmed={!mic} />
          <SceneCard locked onPick={() => {}} dimmed={!mic} />
        </div>
        {!mic && (
          <p className="text-center text-on-surface-variant text-sm -mt-2">
            Enable your mic to unlock the scenes.
          </p>
        )}
      </main>
    </div>
  );
}

function SceneCard({
  scene,
  locked,
  dimmed,
  onPick,
}: {
  scene?: Scene;
  locked: boolean;
  dimmed: boolean;
  onPick: () => void;
}) {
  if (locked || !scene) {
    return (
      <Card className="p-6 flex flex-col items-center justify-center gap-3 min-h-52 opacity-50">
        <Icon name="lock" className="text-3xl text-on-surface-variant" />
        <p className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">More scenes soon</p>
      </Card>
    );
  }
  const lineCount = (charId: string) => scene.lines.filter((l) => l.characterId === charId).length;
  return (
    <button
      onClick={onPick}
      className={`text-left cursor-pointer group ${dimmed ? "opacity-40 pointer-events-none" : ""}`}
    >
      <Card className="p-6 flex flex-col gap-3 min-h-52 group-hover:border-secondary-container group-hover:glow-secondary h-full">
        <div className="flex items-start justify-between">
          <span className="text-4xl">{scene.characters[0]?.emoji}</span>
          <Chip color="cyan">{Math.round(scene.durationMs / 1000)}s</Chip>
        </div>
        <h3 className="font-display font-bold text-xl uppercase leading-tight">{scene.title}</h3>
        <p className="text-sm text-on-surface-variant flex-1">{scene.tagline}</p>
        {scene.sourceUrl && (
          <a
            href={scene.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-bold uppercase tracking-widest text-secondary-container hover:underline flex items-center gap-1 w-fit"
          >
            <Icon name="link" className="text-sm" /> Source
          </a>
        )}
        <div className="flex flex-wrap gap-2">
          {scene.characters.map((c) => (
            <Chip key={c.id} color="dim">
              {c.emoji} {c.name} · {lineCount(c.id)} lines
            </Chip>
          ))}
        </div>
      </Card>
    </button>
  );
}
