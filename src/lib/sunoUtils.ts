/**
 * Parses a standard Suno song URL and returns its corresponding iframe embed URL.
 * Supports formats like:
 * - https://suno.com/song/74b6b690-c20e-4f16-bb4d-efea2cf9b168
 * - https://suno.com/embed/74b6b690-c20e-4f16-bb4d-efea2cf9b168
 * - raw UUID: 74b6b690-c20e-4f16-bb4d-efea2cf9b168
 */
export function parseSunoUrl(url: string): string | null {
  if (!url) return null;
  
  // Regex to match song/UUID or embed/UUID
  const regex = /(?:song|embed)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  const match = url.match(regex);
  
  if (match && match[1]) {
    return `https://suno.com/embed/${match[1]}`;
  }
  
  // Fallback for raw UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const trimmed = url.trim();
  if (uuidRegex.test(trimmed)) {
    return `https://suno.com/embed/${trimmed}`;
  }
  
  return null;
}
