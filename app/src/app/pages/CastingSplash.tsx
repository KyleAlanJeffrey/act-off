import { useEffect, useState } from "react";
import type { Scene } from "../types";
import { sceneAssetUrl } from "../types";
import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";

export default function CastingSplash({
  scene,
  ready,
  dubbedCount,
  onContinue,
  onStartFresh,
}: {
  scene: Scene;
  /** False while the scene's original audio is still decoding. */
  ready: boolean;
  /** Takes restored from a previous session — offers picking up vs. starting fresh. */
  dubbedCount: number;
  onContinue: () => void;
  onStartFresh: () => void;
}) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (revealed >= scene.characters.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 650);
    return () => clearTimeout(t);
  }, [revealed, scene.characters.length]);

  const allRevealed = revealed >= scene.characters.length;

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative">
      <BgBlobs />
      <main className="relative z-10 max-w-2xl w-full flex flex-col items-center gap-10 text-center">
        <div>
          <Chip color="lime" className="mb-4">Casting call</Chip>
          <h1 className="font-display font-extrabold text-4xl md:text-5xl uppercase tracking-tight leading-tight">
            Tonight, the part of{" "}
            <span className="text-primary">everyone</span> will be played by{" "}
            <span className="text-tertiary">you</span>
          </h1>
          <p className="text-on-surface-variant mt-3 font-bold">
            {scene.title} — {scene.lines.length} lines, {scene.characters.length} characters, one hero.
          </p>
        </div>

        <div className="flex gap-6 flex-wrap justify-center">
          {scene.characters.map((c, i) => {
            const isRevealed = i < revealed;
            return (
              <div key={c.id} className="[perspective:800px]">
                <Card
                  active={isRevealed}
                  className={`w-40 p-6 flex flex-col items-center gap-3 transition-transform duration-500 [transform-style:preserve-3d] ${
                    isRevealed ? "" : "[transform:rotateY(180deg)]"
                  }`}
                >
                  {isRevealed ? (
                    <>
                      {c.hasPortrait ? (
                        <img
                          src={sceneAssetUrl(scene.id, `char-${c.id}.jpg`)}
                          alt={c.name}
                          className="w-20 h-20 rounded-full object-cover border-3 border-primary-container glow-primary"
                        />
                      ) : (
                        <span className="text-5xl">{c.emoji}</span>
                      )}
                      <p className="font-display font-bold uppercase">{c.name}</p>
                      <Chip color="pink">You</Chip>
                    </>
                  ) : (
                    <>
                      <span className="text-5xl opacity-30">🎭</span>
                      <p className="font-display font-bold uppercase opacity-30">???</p>
                      <Chip color="dim">&nbsp;</Chip>
                    </>
                  )}
                </Card>
              </div>
            );
          })}
        </div>

        <NeonButton
          variant="tertiary"
          onClick={onContinue}
          disabled={!allRevealed || !ready}
          className="py-4 px-10 text-base"
        >
          {ready ? (
            <>
              To the studio <Icon name="arrow_forward" />
            </>
          ) : (
            <>
              <Icon name="hourglass_top" /> Loading the scene…
            </>
          )}
        </NeonButton>

        {ready && dubbedCount > 0 && (
          <p className="text-sm text-on-surface-variant -mt-6">
            Picking up where you left off —{" "}
            <span className="text-tertiary font-bold">
              {dubbedCount}/{scene.lines.length} lines
            </span>{" "}
            already dubbed.{" "}
            <button
              onClick={onStartFresh}
              className="text-secondary-container font-bold uppercase tracking-wider hover:underline cursor-pointer"
            >
              Start fresh
            </button>
          </p>
        )}
      </main>
    </div>
  );
}
