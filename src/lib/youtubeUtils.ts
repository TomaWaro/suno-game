/**
 * Extracts the 11-character YouTube Video ID from any valid YouTube URL or raw ID.
 * Handles playlists (&list=...), indices (&index=...), timestamps (&t=...), shorts, youtu.be, mobile links, etc.
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // 1. Raw 11-character video ID (e.g. QTvqYrbwEjQ)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Try parsing using native URL object
  try {
    const fullUrlString = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrlString);

    // Standard watch URL: ?v=VIDEO_ID (e.g., watch?v=QTvqYrbwEjQ&list=RDgpz6NV4q7lA&index=2)
    if (parsed.searchParams.has('v')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }
    }

    // Path based formats:
    // - youtu.be/VIDEO_ID?t=12
    // - youtube.com/shorts/VIDEO_ID
    // - youtube.com/embed/VIDEO_ID
    // - youtube.com/v/VIDEO_ID
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (parsed.hostname.includes('youtu.be') && pathParts.length > 0) {
      const id = pathParts[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }

    if (pathParts.length >= 2 && ['shorts', 'embed', 'v'].includes(pathParts[0].toLowerCase())) {
      const id = pathParts[1];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }
  } catch (e) {
    // Ignore URL constructor parse errors and proceed to regex fallback
  }

  // 3. Robust Regex fallback matching 11-char YouTube ID in any URL parameter or path
  const regexes = [
    /[?&]v=([a-zA-Z0-9_-]{11})/i,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
    /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/i,
  ];

  for (const regex of regexes) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parses a YouTube URL and returns its corresponding iframe embed URL with youtube-nocookie.com.
 */
export function parseYouTubeUrl(url: string): string | null {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
}
