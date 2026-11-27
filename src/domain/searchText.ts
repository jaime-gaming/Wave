const EDITION_NOISE =
  /\b(?:remaster(?:ed)?(?:\s+\d{4})?|deluxe(?:\s+edition)?|bonus\s+track|radio\s+edit|album\s+version|single\s+version|explicit|clean|hd|hq|4k|official\s+(?:video|audio))\b/giu;

const FEATURED = /\b(?:feat|ft|with)\.?\s/iu;

export function searchableTitle(title: string): string {
  const stripped = title
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, (group) => (FEATURED.test(group) ? group : ' '))
    .replace(EDITION_NOISE, ' ')
    .replace(/\s*[-–—]\s*$/u, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return stripped || title.trim();
}
