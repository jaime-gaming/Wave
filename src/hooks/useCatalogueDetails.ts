import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bestRelease,
  confirmedRoleRelease,
  catalogueFallbackQueries,
  catalogueQuery,
  detailsPatch,
  needsDetails,
  type CatalogueRelease,
} from '../domain/catalogue';
import { downloadCover, preferredCountry, searchCatalogue } from '../services/catalogue';
import { readArtwork } from '../data/artwork';
import { searchDeezer, searchMusicBrainz } from '../services/musicBrainz';
import { markDetailsChecked } from '../data/library';
import type { Track } from '../domain/types';
import { rolesReviewKey } from '../domain/metadata';

export const DETAILS_FLAG = 'wave-complete-details';

export const DETAILS_RETRY_MS = 30 * 24 * 60 * 60_000;

export const DETAILS_BATCH = 12;

export const DETAILS_GAP_MS = 700;

export function detailsEnabled(): boolean {
  try {
    return localStorage.getItem(DETAILS_FLAG) === 'on';
  } catch {
    return false;
  }
}

export function setDetailsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(DETAILS_FLAG, enabled ? 'on' : 'off');
  } catch {}
}

export function detailsQueue(
  tracks: Track[],
  now = Date.now(),
  excluded: ReadonlySet<string> = new Set(),
  verifyRoles = false,
): Track[] {
  const worth = tracks.filter((track) => {
    const verifyComplete =
      verifyRoles &&
      !track.editedAt &&
      track.source !== 'youtube' &&
      track.rolesReviewed !== rolesReviewKey(track) &&
      track.duration > 0 &&
      !!track.title.trim() &&
      !!track.artist.trim();
    if (excluded.has(track.id) || (!needsDetails(track) && !verifyComplete)) return false;
    if (track.detailsCheckedAt && now - track.detailsCheckedAt < DETAILS_RETRY_MS) return false;
    return true;
  });
  const missing = (track: Track) => (track.artwork ? 0 : 2) + (track.year ? 0 : 1);
  return worth.sort((left, right) => missing(right) - missing(left)).slice(0, DETAILS_BATCH);
}

/** Only compare candidates already matched to this recording; absent data is not disagreement. */
export function catalogueDisagreements(matches: CatalogueRelease[]) {
  const normalized = (value: string) =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const different = (values: (string | undefined)[]) => {
    const present = values
      .filter((value): value is string => !!value?.trim())
      .map(normalized)
      .filter(Boolean);
    return new Set(present).size > 1;
  };
  return {
    album: different(matches.map((match) => match.album)),
    year: new Set(matches.flatMap((match) => (match.year ? [match.year] : []))).size > 1,
    genre: different(matches.map((match) => match.genre)),
  };
}

export function useCatalogueDetails({
  tracks,
  onUpdate,
  enabled = detailsEnabled(),
  online = true,
  verifyRoles = false,
  contrastCatalogues = false,
}: {
  tracks: Track[];

  onUpdate: (id: string, patch: Record<string, unknown>, expected: Track) => Promise<Track | null>;
  enabled?: boolean;
  online?: boolean;
  verifyRoles?: boolean;
  contrastCatalogues?: boolean;
}) {
  const [filling, setFilling] = useState(0);
  const [completed, setCompleted] = useState(0);
  const asked = useRef(new Set<string>());
  const running = useRef(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled || !online) active.current?.abort();
    return () => active.current?.abort();
  }, [enabled, online, contrastCatalogues]);

  const run = useCallback(async () => {
    if (!enabled || !online || running.current) return;
    const queue = detailsQueue(tracks, Date.now(), asked.current, verifyRoles);
    if (!queue.length) return;
    running.current = true;
    const controller = new AbortController();
    active.current = controller;
    const signal = controller.signal;
    setFilling(queue.length);
    const country = preferredCountry();
    try {
      for (const track of queue) {
        if (signal.aborted) break;
        asked.current.add(track.id);
        const query = catalogueQuery(track);
        if (!query) {
          await markDetailsChecked(track.id);
          continue;
        }
        let releases = await searchCatalogue(query, { country, signal });
        let apple = [...releases];
        let deezer: CatalogueRelease[] = [];
        let musicBrainz: CatalogueRelease[] = [];
        let release: CatalogueRelease | undefined =
          confirmedRoleRelease(track, releases) ?? bestRelease(track, releases);
        if (!release && !signal.aborted) {
          for (const fallback of catalogueFallbackQueries(track)) {
            const results = await searchCatalogue(fallback, { country, signal });
            apple = [...apple, ...results];
            releases = [...releases, ...results];
            release = confirmedRoleRelease(track, releases) ?? bestRelease(track, releases);
            if (release || signal.aborted) break;
          }
        }
        if ((!release || contrastCatalogues) && !signal.aborted) {
          deezer = await searchDeezer(query, signal);
          releases = [...releases, ...deezer];
          release = confirmedRoleRelease(track, releases) ?? bestRelease(track, releases);
        }
        if (contrastCatalogues && !signal.aborted) {
          musicBrainz = await searchMusicBrainz(query, signal);
          releases = [...releases, ...musicBrainz];
          // Check all candidates together, so an original-orientation match from one
          // provider prevents an unsafe role swap suggested by another.
          release = confirmedRoleRelease(track, releases) ?? bestRelease(track, releases);
        }
        if (signal.aborted) break;
        // Do not apply a conflicting role swap even if it scored well in isolation.
        if (
          release &&
          confirmedRoleRelease(track, [release]) &&
          !confirmedRoleRelease(track, releases)
        ) {
          release = undefined;
        }
        if (!release) {
          await markDetailsChecked(track.id);
          await new Promise((resolve) => setTimeout(resolve, DETAILS_GAP_MS));
          continue;
        }
        const { patch, filled } = detailsPatch(track, release);
        const candidates = contrastCatalogues
          ? [apple, deezer, musicBrainz].flatMap((source) => {
              const match = confirmedRoleRelease(track, source) ?? bestRelease(track, source);
              return match ? [match] : [];
            })
          : [];
        const disagreement = catalogueDisagreements(candidates);
        const remove = (field: keyof typeof patch, label: string) => {
          delete patch[field];
          const index = filled.indexOf(label);
          if (index >= 0) filled.splice(index, 1);
        };
        if (disagreement.album) {
          remove('album', 'album');
          remove('trackNumber', 'order');
          delete patch.discNumber;
        }
        if (disagreement.year) remove('year', 'year');
        if (disagreement.genre) {
          delete patch.genres;
          for (const label of ['genre', 'genres']) {
            const index = filled.indexOf(label);
            if (index >= 0) filled.splice(index, 1);
          }
        }

        if (!disagreement.album && !track.artwork && release.artworkUrl) {
          const file = await downloadCover(release.artworkUrl, signal);
          if (file) {
            try {
              patch.artwork = await readArtwork(file);
              filled.push('cover');
            } catch {}
          }
        }
        if (signal.aborted) break;
        const updated = filled.length ? await onUpdate(track.id, patch, track) : null;
        if (!updated) await markDetailsChecked(track.id);
        if (updated && filled.length) setCompleted((count) => count + 1);
        await new Promise((resolve) => setTimeout(resolve, DETAILS_GAP_MS));
      }
    } catch {
    } finally {
      running.current = false;
      if (active.current === controller) active.current = null;
      if (signal.aborted) asked.current.clear();
      setFilling(0);
    }
  }, [enabled, online, onUpdate, tracks, verifyRoles, contrastCatalogues]);

  useEffect(() => {
    if (!enabled || !online || filling) return;

    const timer = setTimeout(() => void run(), 1_500);
    return () => clearTimeout(timer);
  }, [enabled, online, run, filling]);

  const lookUp = useCallback(() => {
    asked.current.clear();
    return run();
  }, [run]);

  return { filling, completed, lookUp };
}

export function detailsSummary(tracks: Track[]): { incomplete: number; complete: number } {
  let incomplete = 0;
  for (const track of tracks) if (needsDetails(track)) incomplete++;
  return { incomplete, complete: tracks.length - incomplete };
}
