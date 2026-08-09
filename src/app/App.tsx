import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { ReactElement } from "react";
import type { Scene, Take } from "./types";
import { sceneAssetUrl } from "./types";
import { fetchAudioBuffer, MicSession } from "./lib/audio";
import Landing from "./pages/Landing";
import SceneSelect from "./pages/SceneSelect";
import CastingSplash from "./pages/CastingSplash";
import Studio from "./pages/Studio";
import Screening from "./pages/Screening";

export default function App() {
  const navigate = useNavigate();
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
    navigate(`/solo/${s.id}/cast`);
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
      navigate("/solo", { replace: true });
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
    navigate("/solo");
  };

  /**
   * Scene routes carry state that only exists after walking the flow (decoded
   * audio, mic, takes). On a reload or stale deep link, fall back to the
   * scene picker rather than rendering a broken page.
   */
  const SceneRoute = ({
    needMic,
    render,
  }: {
    needMic?: boolean;
    render: (scene: Scene, original: AudioBuffer) => ReactElement;
  }) => {
    const { sceneId } = useParams();
    if (!scene || scene.id !== sceneId || (needMic && !mic)) {
      return <Navigate to="/solo" replace />;
    }
    if (!originalBuffer) {
      // Audio still decoding (or the page was reloaded mid-flow): the casting
      // page owns the "loading" presentation, so park there.
      return <Navigate to={`/solo/${scene.id}/cast`} replace />;
    }
    return render(scene, originalBuffer);
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-error font-bold">{loadError} Try a refresh.</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Landing onSolo={() => navigate("/solo")} />} />
      <Route
        path="/solo"
        element={
          <SceneSelect
            scenes={scenes}
            mic={mic}
            onMicReady={setMic}
            onPick={(s) => void pickScene(s)}
            onBack={() => navigate("/")}
          />
        }
      />
      <Route
        path="/solo/:sceneId/cast"
        element={
          <CastRoute
            scene={scene}
            ready={originalBuffer !== null}
            onContinue={(s) => navigate(`/solo/${s.id}/studio`)}
          />
        }
      />
      <Route
        path="/solo/:sceneId/studio"
        element={
          <SceneRoute
            needMic
            render={(s, original) => (
              <Studio
                scene={s}
                originalBuffer={original}
                backgroundBuffer={backgroundBuffer}
                mic={mic!}
                takes={takes}
                onTake={recordTake}
                onWrap={() => navigate(`/solo/${s.id}/screening`)}
              />
            )}
          />
        }
      />
      <Route
        path="/solo/:sceneId/screening"
        element={
          <SceneRoute
            render={(s, original) => (
              <Screening
                scene={s}
                originalBuffer={original}
                backgroundBuffer={backgroundBuffer}
                vocalsBuffer={vocalsBuffer}
                takes={takes}
                onBackToStudio={() => navigate(`/solo/${s.id}/studio`)}
                onNewScene={backToSelect}
              />
            )}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function CastRoute({
  scene,
  ready,
  onContinue,
}: {
  scene: Scene | null;
  ready: boolean;
  onContinue: (scene: Scene) => void;
}) {
  const { sceneId } = useParams();
  if (!scene || scene.id !== sceneId) return <Navigate to="/solo" replace />;
  return (
    <CastingSplash scene={scene} ready={ready} onContinue={() => onContinue(scene)} />
  );
}
