import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { ReactElement } from "react";
import type { Scene, Take } from "./types";
import { sceneAssetUrl } from "./types";
import { blobToAudioBuffer, fetchAudioBuffer, MicSession } from "./lib/audio";
import { clearTakes, loadTakes, saveTake } from "./lib/takesStore";
import { LoadingStage } from "./components/ui";
import Landing from "./pages/Landing";
import SceneSelect from "./pages/SceneSelect";
import CastingSplash from "./pages/CastingSplash";
import Studio from "./pages/Studio";
import Screening from "./pages/Screening";
import Editor from "./pages/Editor";

export default function App() {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoaded, setScenesLoaded] = useState(false);
  const [scene, setScene] = useState<Scene | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [backgroundBuffer, setBackgroundBuffer] = useState<AudioBuffer | null>(null);
  const [vocalsBuffer, setVocalsBuffer] = useState<AudioBuffer | null>(null);
  const [mic, setMic] = useState<MicSession | null>(null);
  const [takes, setTakes] = useState<Map<number, Take>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingSceneRef = useRef<string | null>(null);

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
      .then((loaded) => {
        setScenes(loaded);
        setScenesLoaded(true);
      })
      .catch(() => setLoadError("Could not load the scene library."));
  }, []);

  /**
   * Loads a scene's audio (and stems) and restores any persisted takes for it
   * from IndexedDB — the path for both picking a scene and resuming after a
   * reload or deep link.
   */
  const loadScene = async (s: Scene) => {
    if (loadingSceneRef.current === s.id) return;
    loadingSceneRef.current = s.id;
    setScene(s);
    setTakes(new Map());
    setOriginalBuffer(null);
    setBackgroundBuffer(null);
    setVocalsBuffer(null);
    try {
      const [original, background, vocals, saved] = await Promise.all([
        fetchAudioBuffer(sceneAssetUrl(s.id, "original.m4a")),
        s.hasBackground
          ? fetchAudioBuffer(sceneAssetUrl(s.id, "background.m4a"))
          : Promise.resolve(null),
        s.hasVocals
          ? fetchAudioBuffer(sceneAssetUrl(s.id, "vocals.m4a"))
          : Promise.resolve(null),
        loadTakes(s.id),
      ]);
      const restored = await Promise.all(
        saved.map(async ({ lineIndex, blob }): Promise<[number, Take]> => [
          lineIndex,
          { lineIndex, state: "recorded", blob, buffer: await blobToAudioBuffer(blob) },
        ])
      );
      setTakes(new Map(restored));
      setOriginalBuffer(original);
      setBackgroundBuffer(background);
      setVocalsBuffer(vocals);
    } catch {
      setLoadError("Could not load the scene audio.");
      loadingSceneRef.current = null;
      navigate("/solo", { replace: true });
    }
  };

  const pickScene = (s: Scene) => {
    navigate(`/solo/${s.id}/cast`);
    void loadScene(s);
  };

  const recordTake = (lineIndex: number, take: Take) => {
    setTakes((prev) => new Map(prev).set(lineIndex, take));
    if (scene && take.blob) void saveTake(scene.id, lineIndex, take.blob);
  };

  /** Drops the restored takes and their saved copies ("start fresh"). */
  const startFresh = () => {
    setTakes(new Map());
    if (scene) void clearTakes(scene.id);
  };

  const backToSelect = () => {
    setScene(null);
    loadingSceneRef.current = null;
    setOriginalBuffer(null);
    setBackgroundBuffer(null);
    setVocalsBuffer(null);
    setTakes(new Map());
    navigate("/solo");
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-error font-bold">{loadError} Try a refresh.</p>
      </div>
    );
  }

  const flowProps = {
    scenesLoaded,
    scenes,
    scene,
    originalBuffer,
    mic,
    onLoadScene: (s: Scene) => void loadScene(s),
    onMicReady: setMic,
  };

  return (
    <Routes>
      <Route path="/" element={<Landing scenes={scenes} onSolo={() => navigate("/solo")} />} />
      <Route
        path="/solo"
        element={
          <SceneSelect
            scenes={scenes}
            mic={mic}
            onMicReady={setMic}
            onPick={pickScene}
            onBack={() => navigate("/")}
            onBuild={() => navigate("/editor")}
          />
        }
      />
      <Route path="/editor" element={<Editor onBack={() => navigate("/solo")} />} />
      <Route
        path="/solo/:sceneId/cast"
        element={
          <SceneFlowRoute {...flowProps} requireAudio={false}>
            {(s) => (
              <CastingSplash
                scene={s}
                ready={originalBuffer !== null}
                dubbedCount={takes.size}
                onContinue={() => navigate(`/solo/${s.id}/studio`)}
                onStartFresh={startFresh}
              />
            )}
          </SceneFlowRoute>
        }
      />
      <Route
        path="/solo/:sceneId/studio"
        element={
          <SceneFlowRoute {...flowProps} needMic>
            {(s, original) => (
              <Studio
                scene={s}
                originalBuffer={original!}
                backgroundBuffer={backgroundBuffer}
                mic={mic!}
                takes={takes}
                onTake={recordTake}
                onWrap={() => navigate(`/solo/${s.id}/screening`)}
              />
            )}
          </SceneFlowRoute>
        }
      />
      <Route
        path="/solo/:sceneId/screening"
        element={
          <SceneFlowRoute {...flowProps}>
            {(s, original) => (
              <Screening
                scene={s}
                originalBuffer={original!}
                backgroundBuffer={backgroundBuffer}
                vocalsBuffer={vocalsBuffer}
                takes={takes}
                onBackToStudio={() => navigate(`/solo/${s.id}/studio`)}
                onNewScene={backToSelect}
              />
            )}
          </SceneFlowRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Guards a scene-flow route and self-restores what it can after a reload or
 * deep link: loads the scene named in the URL (audio + persisted takes) and
 * reopens the mic when the browser has already granted permission. Only when
 * restoration is impossible (unknown scene, mic needs a click) does it fall
 * back to the scene picker.
 */
function SceneFlowRoute({
  scenesLoaded,
  scenes,
  scene,
  originalBuffer,
  mic,
  needMic = false,
  requireAudio = true,
  onLoadScene,
  onMicReady,
  children,
}: {
  scenesLoaded: boolean;
  scenes: Scene[];
  scene: Scene | null;
  originalBuffer: AudioBuffer | null;
  mic: MicSession | null;
  needMic?: boolean;
  requireAudio?: boolean;
  onLoadScene: (s: Scene) => void;
  onMicReady: (m: MicSession) => void;
  children: (scene: Scene, original: AudioBuffer | null) => ReactElement;
}) {
  const { sceneId } = useParams();
  const [micUnavailable, setMicUnavailable] = useState(false);
  const target = scenes.find((s) => s.id === sceneId) ?? null;
  const sceneReady = scene !== null && scene.id === sceneId;

  useEffect(() => {
    if (scenesLoaded && target && !sceneReady) onLoadScene(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenesLoaded, target?.id, sceneReady]);

  useEffect(() => {
    if (!needMic || mic) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (status.state === "granted" && !cancelled) {
          onMicReady(await MicSession.open());
          return;
        }
      } catch {
        // Permissions API unavailable — treat as needing a click
      }
      if (!cancelled) setMicUnavailable(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needMic, mic]);

  if (scenesLoaded && !target) return <Navigate to="/solo" replace />;
  if (needMic && micUnavailable && !mic) return <Navigate to="/solo" replace />;
  if (!sceneReady || (requireAudio && !originalBuffer) || (needMic && !mic)) {
    return <LoadingStage />;
  }
  return children(scene!, originalBuffer);
}
