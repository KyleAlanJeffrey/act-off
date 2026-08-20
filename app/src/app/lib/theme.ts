// Canvas code can't use Tailwind classes — these helpers read the Pop-Neon
// Night tokens (declared in index.css @theme) off the DOM so canvas drawing
// shares one palette with the rest of the UI. Fallbacks keep drawing sane if
// a token is ever renamed.
export function themeColor(el: Element, token: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(token).trim() || fallback;
}

/** "#rrggbb" + alpha 0..1 → "#rrggbbaa" */
export function withAlpha(hex: string, alpha: number): string {
  return (
    hex +
    Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0")
  );
}
