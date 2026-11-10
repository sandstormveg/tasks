// A captured YouTube source opens in the archive; other sources keep the existing source-page route.
import { extractYouTubeVideoId } from "../core/youtube.js";

/** Fill only missing oEmbed fields; preserve any metadata already set by the user. */
export function fillEmptyVideoMetadata(source, metadata = {}) {
  const result = { ...source };
  for (const key of ["title", "author", "thumbnail"]) {
    if (!String(result[key] || "").trim() && String(metadata[key] || "").trim()) {
      result[key] = String(metadata[key]).trim();
    }
  }
  return result;
}

export function videoArchiveRoute(source) {
  if (!source || source.kind !== "video" || !source.id || !extractYouTubeVideoId(source.url || "")) return null;
  return `#/videos?id=${encodeURIComponent(source.id)}`;
}
