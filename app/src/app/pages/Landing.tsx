import type { Scene } from "../types";
import { sceneAssetUrl } from "../types";
import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";

const TITLE = ["D", "U", "B", "-", "O", "F", "F"];

export default function Landing({
  scenes,
  onSolo,
}: {
  scenes: Scene[];
  onSolo: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <SceneStrips scenes={scenes} />
      <BgBlobs />
      <main className="relative z-10 flex flex-col items-center gap-10 w-full max-w-xl">
        <div className="text-center">
          <h1 className="font-display font-extrabold text-4xl sm:text-5xl md:text-7xl uppercase tracking-tighter whitespace-nowrap">
            {TITLE.map((ch, i) => (
              <span
                key={i}
                className={`inline-block hover:scale-110 hover:-rotate-6 transition-transform duration-300 origin-bottom ${
                  i > 3 ? "text-tertiary" : "text-on-background"
                } ${ch === "-" ? "mx-1" : ""}`}
              >
                {ch}
              </span>
            ))}
          </h1>
          <p className="font-display font-bold text-2xl text-on-surface-variant mt-5 leading-tight">
            Re-voice famous scenes with your friends.
            <span className="text-primary block mt-1">Line by line. Badly.</span>
          </p>
        </div>

        <div className="flex flex-col w-full max-w-sm gap-5">
          <NeonButton variant="tertiary" onClick={onSolo} className="py-5 text-base">
            <Icon name="mic_external_on" className="text-2xl" />
            Solo Show — play everyone
          </NeonButton>

          <Card className="p-5 relative">
            <div className="absolute -top-3 right-4">
              <Chip color="pink">Coming soon</Chip>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant text-center mb-3">
              Party mode
            </p>
            <div className="flex gap-3 opacity-40 pointer-events-none">
              <NeonButton variant="primary" className="flex-1">
                Start a Show
              </NeonButton>
              <input
                className="w-28 bg-surface text-center font-display font-bold text-xl rounded-md border-3 border-outline-variant uppercase placeholder:text-outline-variant/60 focus:outline-none"
                maxLength={4}
                placeholder="CODE"
              />
            </div>
          </Card>
        </div>

        <Card className="p-6 w-full">
          <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant text-center mb-5">
            How it works
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: "theater_comedy", title: "1. Get cast", blurb: "Take a role in a scene", c: "text-primary" },
              { icon: "graphic_eq", title: "2. Record lines", blurb: "Match the original. Or don't", c: "text-secondary-container" },
              { icon: "play_circle", title: "3. Watch the dub", blurb: "Laugh at the results", c: "text-tertiary" },
            ].map((s) => (
              <div key={s.title} className="flex flex-col items-center text-center gap-2">
                <div className="w-14 h-14 bg-surface-container-highest border-3 border-outline-variant rounded-full flex items-center justify-center">
                  <Icon name={s.icon} className={`text-2xl ${s.c}`} />
                </div>
                <p className="font-bold text-sm">{s.title}</p>
                <p className="text-xs text-on-surface-variant">{s.blurb}</p>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}

/**
 * Backdrop of the actual scene library: tilted film strips of scene stills
 * (thumbnail + character faces) drifting slowly behind the marquee. Repeats
 * the pool to fill the strips, so it works with a library of one.
 */
function SceneStrips({ scenes }: { scenes: Scene[] }) {
  const stills = scenes.flatMap((s) => [
    ...(s.hasThumb ? [sceneAssetUrl(s.id, "thumb.jpg")] : []),
    ...s.characters
      .filter((c) => c.hasPortrait)
      .map((c) => sceneAssetUrl(s.id, `char-${c.id}.jpg`)),
  ]);
  if (stills.length === 0) return null;

  // Enough frames that each strip's repeating half fills any screen width
  const perStrip = Math.max(8, Math.ceil(8 / stills.length) * stills.length);
  const strips = [
    { duration: "90s", reverse: false, offset: 0 },
    { duration: "140s", reverse: true, offset: 1 },
    { duration: "110s", reverse: false, offset: 2 },
  ];

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
    >
      <div className="absolute inset-x-[-10%] top-1/2 -translate-y-1/2 flex flex-col gap-6 -rotate-6 scale-110 opacity-45">
        {strips.map(({ duration, reverse, offset }, row) => {
          const frames = Array.from(
            { length: perStrip },
            (_, i) => stills[(i + offset) % stills.length]
          );
          return (
            <div key={row} className="overflow-hidden">
              <div
                className={`flex gap-6 w-max strip-drift ${reverse ? "strip-drift-reverse" : ""}`}
                style={{ "--strip-duration": duration } as React.CSSProperties}
              >
                {/* content twice over for a seamless -50% loop */}
                {[0, 1].map((half) => (
                  <div key={half} className="flex gap-6">
                    {frames.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        // NOT loading="lazy": iOS Safari never paints lazy
                        // images inside transformed containers (the strips are
                        // rotated/scaled), leaving the backdrop blank.
                        decoding="async"
                        className="h-28 md:h-36 aspect-video object-cover rounded-md border-2 border-outline-variant"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Scrim behind the centered content; strips stay visible at the sides */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_center,var(--color-background)_15%,transparent_100%)] opacity-80" />
    </div>
  );
}
