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
