import { useEffect, useState } from "react";
import type { Scene } from "../types";
import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";

export default function CastingSplash({
  scene,
  onContinue,
}: {
  scene: Scene;
  onContinue: () => void;
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
                      <span className="text-5xl">{c.emoji}</span>
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
          disabled={!allRevealed}
          className="py-4 px-10 text-base"
        >
          To the studio <Icon name="arrow_forward" />
        </NeonButton>
      </main>
    </div>
  );
}
