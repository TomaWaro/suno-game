/**
 * Parses a YouTube URL and returns its corresponding iframe embed URL.
 * Supports formats like:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - raw 11-char video ID
 */
export function parseYouTubeUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // 1. Check for standard watch?v=VIDEO_ID or short formats
  const watchMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/i);
  if (watchMatch && watchMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${watchMatch[1]}?autoplay=1&enablejsapi=1`;
  }

  // 2. Fallback for raw 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube-nocookie.com/embed/${trimmed}?autoplay=1&enablejsapi=1`;
  }

  return null;
}
