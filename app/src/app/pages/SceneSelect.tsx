import { useEffect, useRef, useState } from "react";
import type { Scene } from "../types";
import { sceneAssetUrl } from "../types";
import { MicSession } from "../lib/audio";
import { countTakesByScene } from "../lib/takesStore";
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
  const [savedCounts, setSavedCounts] = useState<Map<string, number>>(new Map());
  const rafRef = useRef(0);

  // Saved takes from a previous session show as a "Resume" badge per card.
  useEffect(() => {
    void countTakesByScene().then(setSavedCounts);
  }, []);

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
            <SceneCard
              key={scene.id}
              scene={scene}
              locked={false}
              savedCount={savedCounts.get(scene.id) ?? 0}
              onPick={() => mic && onPick(scene)}
              dimmed={!mic}
            />
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
  savedCount = 0,
  onPick,
}: {
  scene?: Scene;
  locked: boolean;
  dimmed: boolean;
  savedCount?: number;
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
  const badges = (
    <div className="flex gap-2 flex-wrap justify-end">
      {savedCount > 0 && (
        <Chip color="lime">Resume · {savedCount}/{scene.lines.length}</Chip>
      )}
      <Chip color="cyan">{Math.round(scene.durationMs / 1000)}s</Chip>
    </div>
  );
  return (
    <button
      onClick={onPick}
      className={`text-left cursor-pointer group ${dimmed ? "opacity-40 pointer-events-none" : ""}`}
    >
      <Card className="overflow-hidden flex flex-col min-h-52 h-full group-hover:border-secondary-container group-hover:glow-secondary">
        {scene.hasThumb && (
          <div className="relative border-b-3 border-outline-variant">
            <img
              src={sceneAssetUrl(scene.id, "thumb.jpg")}
              alt=""
              className="w-full aspect-video object-cover"
            />
            <div className="absolute top-2.5 right-2.5">{badges}</div>
          </div>
        )}
        <div className="p-5 flex flex-col gap-3 flex-1">
          {!scene.hasThumb && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-4xl">{scene.characters[0]?.emoji}</span>
              {badges}
            </div>
          )}
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
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest py-0.5 pr-3 pl-0.5 whitespace-nowrap"
              >
                {c.hasPortrait ? (
                  <img
                    src={sceneAssetUrl(scene.id, `char-${c.id}.jpg`)}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover border-2 border-outline-variant"
                  />
                ) : (
                  <span className="pl-2">{c.emoji}</span>
                )}
                {c.name} · {lineCount(c.id)} lines
              </span>
            ))}
          </div>
        </div>
      </Card>
    </button>
  );
}
