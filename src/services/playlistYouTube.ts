import { scoreCandidate, type ImportedEntry } from '../domain/playlistImport';
import { searchYouTubeCatalog, type YouTubeCatalogResult } from './videoMeta';

export interface YouTubeProposal {
  entry: ImportedEntry;
  video?: YouTubeCatalogResult;
  score: number;
  accepted: boolean;
}

export async function findPlaylistVideos(
  entries: ImportedEntry[],
  options: { signal: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<YouTubeProposal[]> {
  const proposals: YouTubeProposal[] = new Array(entries.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (!options.signal.aborted) {
      const index = next++;
      if (index >= entries.length) return;
      const entry = entries[index];
      const results = await searchYouTubeCatalog(`${entry.artist} ${entry.title}`.trim(), {
        limit: 8,
        signal: options.signal,
      });
      if (options.signal.aborted) return;
      const ranked = results
        .map((video) => ({
          video,
          score: scoreCandidate(entry, {
            id: video.videoId,
            title: video.title,
            artist: video.artist,
            album: '',
            duration: video.duration,
          }).score,
        }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      proposals[index] = {
        entry,
        ...(best && best.score >= 0.45 ? { video: best.video } : {}),
        score: best?.score ?? 0,
        accepted: !!best && best.score >= 0.82 && !!entry.artist.trim(),
      };
      options.onProgress?.(++done, entries.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
  return proposals.filter(Boolean);
}
