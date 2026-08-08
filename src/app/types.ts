export type Character = {
  id: string;
  name: string;
  emoji: string;
};

export type CueLine = {
  index: number;
  characterId: string;
  text: string;
  startMs: number;
  endMs: number;
};

export type Scene = {
  id: string;
  title: string;
  tagline: string;
  durationMs: number;
  /** True when the pack includes background.m4a (scene audio minus dialogue). */
  hasBackground?: boolean;
  /** True when the pack includes vocals.m4a (dialogue only). */
  hasVocals?: boolean;
  characters: Character[];
  lines: CueLine[];
};

export type TakeState = "empty" | "recording" | "recorded";

export type Take = {
  lineIndex: number;
  state: TakeState;
  blob?: Blob;
  buffer?: AudioBuffer;
};

export type SoloPhase = "landing" | "select" | "cast" | "studio" | "screening";

export const sceneAssetUrl = (sceneId: string, file: string) =>
  `/scenes/${sceneId}/${file}`;
