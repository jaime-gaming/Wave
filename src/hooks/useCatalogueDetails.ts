import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bestRelease,
  catalogueQuery,
  detailsPatch,
  needsDetails,
  type CatalogueRelease,
} from '../domain/catalogue';
import { downloadCover, preferredCountry, searchCatalogue } from '../services/catalogue';
import { readArtwork } from '../data/artwork';
import { markDetailsChecked } from '../data/library';
import type { Track } from '../domain/types';

/**
 * Filling in what a file could not say about itself.
 *
 * Runs quietly in the background, one song at a time and only when the library
 * already has songs with holes: an unknown artist, no album, no year, no sleeve,
 * or a title that is really a filename. Each song is asked about once and then
 * left alone for a month — a catalogue that answers "no" today may answer
 * tomorrow, but not on every render.
 *
 * Nothing is ever overwritten: a title the listener typed, a tag the file
 * carried, and the length of the actual audio are all out of reach. A song that
 * is already complete is never sent anywhere at all.
 */
export const DETAILS_FLAG = 'wave-complete-details';
/** How long a song is left alone after one question. */
export const DETAILS_RETRY_MS = 30 * 24 * 60 * 60_000;
/** Songs asked about in one sitting: a library of thousands must not stampede. */
export const DETAILS_BATCH = 12;
/** Space between questions, so the provider is not hammered. */
export const DETAILS_GAP_MS = 700;

export function detailsEnabled(): boolean {
  try {
    return localStorage.getItem(DETAILS_FLAG) !== 'off';
  } catch {
    return true;
  }
}

export function setDetailsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(DETAILS_FLAG, enabled ? 'on' : 'off');
  } catch {
    // A browser that refuses storage simply keeps the default.
  }
}

/** The songs worth asking about right now, most incomplete first. */
export function detailsQueue(tracks: Track[], now = Date.now()): Track[] {
  const worth = tracks.filter((track) => {
    if (!needsDetails(track)) return false;
    if (track.detailsCheckedAt && now - track.detailsCheckedAt < DETAILS_RETRY_MS) return false;
    return true;
  });
  const missing = (track: Track) => (track.artwork ? 0 : 2) + (track.year ? 0 : 1);
  return worth.sort((left, right) => missing(right) - missing(left)).slice(0, DETAILS_BATCH);
}

export function useCatalogueDetails({
  tracks,
  onUpdate,
  enabled = detailsEnabled(),
  online = true,
}: {
  tracks: Track[];
  /** Stores the filled fields and gives the caller the updated song. */
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<Track | null>;
  enabled?: boolean;
  online?: boolean;
}) {
  const [filling, setFilling] = useState(0);
  const [completed, setCompleted] = useState(0);
  const asked = useRef(new Set<string>());
  const running = useRef(false);

  const run = useCallback(async () => {
    if (!enabled || !online || running.current) return;
    const queue = detailsQueue(tracks).filter((track) => !asked.current.has(track.id));
    if (!queue.length) return;
    running.current = true;
    setFilling(queue.length);
    const country = preferredCountry();
    for (const track of queue) {
      asked.current.add(track.id);
      const query = catalogueQuery(track);
      if (!query) {
        await markDetailsChecked(track.id);
        continue;
      }
      const releases = await searchCatalogue(query, { country });
      const release: CatalogueRelease | undefined = bestRelease(track, releases);
      if (!release) {
        await markDetailsChecked(track.id);
        await new Promise((resolve) => setTimeout(resolve, DETAILS_GAP_MS));
        continue;
      }
      const { patch, filled } = detailsPatch(track, release);
      // The sleeve is the one part that needs a second request and a local copy:
      // it is fetched only when there is a gap to fill and a release to fill it.
      if (!track.artwork && release.artworkUrl) {
        const file = await downloadCover(release.artworkUrl);
        if (file) {
          try {
            patch.artwork = await readArtwork(file);
            filled.push('cover');
          } catch {
            /* An unusable image is not a reason to lose the text that came with it. */
          }
        }
      }
      const updated = filled.length ? await onUpdate(track.id, patch) : null;
      if (!updated) await markDetailsChecked(track.id);
      if (filled.length) setCompleted((count) => count + 1);
      await new Promise((resolve) => setTimeout(resolve, DETAILS_GAP_MS));
    }
    running.current = false;
    setFilling(0);
  }, [enabled, online, onUpdate, tracks]);

  useEffect(() => {
    if (!enabled || !online) return;
    // Deferred so a library that is still loading is not asked about twice.
    const timer = setTimeout(() => void run(), 1_500);
    return () => clearTimeout(timer);
  }, [enabled, online, run]);

  /** Asks again now, including songs that were already asked about today. */
  const lookUp = useCallback(() => {
    asked.current.clear();
    return run();
  }, [run]);

  return { filling, completed, lookUp };
}

/** How much of the library still has gaps, for the one line that says so. */
export function detailsSummary(tracks: Track[]): { incomplete: number; complete: number } {
  let incomplete = 0;
  for (const track of tracks) if (needsDetails(track)) incomplete++;
  return { incomplete, complete: tracks.length - incomplete };
}
