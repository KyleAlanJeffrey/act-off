import { BgBlobs, Card, Chip, Icon, NeonButton } from "../components/ui";

const TITLE = ["D", "U", "B", "-", "O", "F", "F"];

export default function Landing({ onSolo }: { onSolo: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <BgBlobs />
      <main className="relative z-10 flex flex-col items-center gap-10 w-full max-w-xl">
        <div className="text-center">
          <h1 className="font-display font-extrabold text-6xl md:text-7xl uppercase tracking-tighter">
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
