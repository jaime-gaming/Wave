/**
 * How a title should be said to a search engine.
 *
 * Files carry edition words that no provider indexes as part of the song's
 * name: "(Remastered 2011)", "[Deluxe Edition]", "- Radio Edit", "HD". A
 * featured artist is the exception — it usually helps a search and is part of
 * how the song is credited — so it stays.
 */
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
