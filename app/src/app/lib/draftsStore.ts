// Named editor drafts in localStorage. Unlike the single autosave slot,
// these are explicit snapshots you can come back to later — a draft made
// from a YouTube link keeps its sourceUrl so the video can be re-fetched.
import { slugify } from "./subtitles";
import type { DraftCharacter, DraftLine } from "./subtitles";
import type { Trim } from "../components/EditorTimeline";

export type SavedDraft = {
  key: string;
  savedAt: number;
  meta: { id: string; title: string; tagline: string; sourceUrl: string };
  characters: DraftCharacter[];
  lines: DraftLine[];
  trim: Trim | null;
};

const KEY = "dub-off-editor-saved-drafts";
const MAX_DRAFTS = 20;

export function listDrafts(): SavedDraft[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Saves (or overwrites, keyed by scene id/title) and returns the new list. */
export function upsertDraft(draft: Omit<SavedDraft, "key" | "savedAt">): SavedDraft[] {
  const key = draft.meta.id || slugify(draft.meta.title) || "untitled";
  const next = [
    { ...draft, key, savedAt: Date.now() },
    ...listDrafts().filter((d) => d.key !== key),
  ].slice(0, MAX_DRAFTS);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deleteDraft(key: string): SavedDraft[] {
  const next = listDrafts().filter((d) => d.key !== key);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
