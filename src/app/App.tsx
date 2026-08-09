import { useEffect, useState } from "react";
import type { Scene, SoloPhase, Take } from "./types";
import { sceneAssetUrl } from "./types";
import { fetchAudioBuffer, MicSession } from "./lib/audio";
import Landing from "./pages/Landing";
import SceneSelect from "./pages/SceneSelect";
import CastingSplash from "./pages/CastingSplash";
import Studio from "./pages/Studio";
import Screening from "./pages/Screening";

export default function App() {
  const [phase, setPhase] = useState<SoloPhase>("landing");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [backgroundBuffer, setBackgroundBuffer] = useState<AudioBuffer | null>(null);
  const [vocalsBuffer, setVocalsBuffer] = useState<AudioBuffer | null>(null);
  const [mic, setMic] = useState<MicSession | null>(null);
  const [takes, setTakes] = useState<Map<number, Take>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const idx = await fetch("/scenes/index.json");
      if (!idx.ok) throw new Error(`scene index: ${idx.status}`);
      const ids = (await idx.json()) as string[];
      // A scene whose media isn't built locally just gets skipped — the index
      // is tracked in git, the media isn't.
      const loaded = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(sceneAssetUrl(id, "cues.json"));
            return res.ok ? ((await res.json()) as Scene) : null;
          } catch {
            return null;
          }
        })
      );
      return loaded.filter((s): s is Scene => s !== null);
    })()
      .then(setScenes)
      .catch(() => setLoadError("Could not load the scene library."));
  }, []);

  const pickScene = async (s: Scene) => {
    setScene(s);
    setTakes(new Map());
    setBackgroundBuffer(null);
    setVocalsBuffer(null);
    setPhase("cast");
    // Decode the scene audio (and stems, if the pack has them) while the
    // casting splash plays
    try {
      const [original, background, vocals] = await Promise.all([
        fetchAudioBuffer(sceneAssetUrl(s.id, "original.m4a")),
        s.hasBackground
          ? fetchAudioBuffer(sceneAssetUrl(s.id, "background.m4a"))
          : Promise.resolve(null),
        s.hasVocals
          ? fetchAudioBuffer(sceneAssetUrl(s.id, "vocals.m4a"))
          : Promise.resolve(null),
      ]);
      setOriginalBuffer(original);
      setBackgroundBuffer(background);
      setVocalsBuffer(vocals);
    } catch {
      setLoadError("Could not load the scene audio.");
      setPhase("select");
    }
  };

  const recordTake = (lineIndex: number, take: Take) => {
    setTakes((prev) => new Map(prev).set(lineIndex, take));
  };

  const backToSelect = () => {
    setScene(null);
    setOriginalBuffer(null);
    setBackgroundBuffer(null);
    setVocalsBuffer(null);
    setTakes(new Map());
    setPhase("select");
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-error font-bold">{loadError} Try a refresh.</p>
      </div>
    );
  }

  switch (phase) {
    case "landing":
      return <Landing onSolo={() => setPhase("select")} />;
    case "select":
      return (
        <SceneSelect
          scenes={scenes}
          mic={mic}
          onMicReady={setMic}
          onPick={(s) => void pickScene(s)}
          onBack={() => setPhase("landing")}
        />
      );
    case "cast":
      return scene ? (
        <CastingSplash
          scene={scene}
          ready={originalBuffer !== null}
          onContinue={() => setPhase("studio")}
        />
      ) : null;
    case "studio":
      return scene && originalBuffer && mic ? (
        <Studio
          scene={scene}
          originalBuffer={originalBuffer}
          backgroundBuffer={backgroundBuffer}
          mic={mic}
          takes={takes}
          onTake={recordTake}
          onWrap={() => setPhase("screening")}
        />
      ) : null;
    case "screening":
      return scene && originalBuffer ? (
        <Screening
          scene={scene}
          originalBuffer={originalBuffer}
          backgroundBuffer={backgroundBuffer}
          vocalsBuffer={vocalsBuffer}
          takes={takes}
          onBackToStudio={() => setPhase("studio")}
          onNewScene={backToSelect}
        />
      ) : null;
  }
}
