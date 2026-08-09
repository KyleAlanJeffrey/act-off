export type Character = {
  id: string;
  name: string;
  emoji: string;
  /** True when the pack includes char-<id>.jpg (a frame of them speaking). */
  hasPortrait?: boolean;
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
  /** Optional provenance link (e.g. the YouTube video the clip came from). */
  sourceUrl?: string;
  durationMs: number;
  /** True when the pack includes background.m4a (scene audio minus dialogue). */
  hasBackground?: boolean;
  /** True when the pack includes vocals.m4a (dialogue only). */
  hasVocals?: boolean;
  /** True when the pack includes thumb.jpg (a frame from the scene). */
  hasThumb?: boolean;
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

export const sceneAssetUrl = (sceneId: string, file: string) =>
  `/scenes/${sceneId}/${file}`;
