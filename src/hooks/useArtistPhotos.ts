import { useCallback, useEffect, useRef, useState } from 'react';
import { canonical } from '../domain/lyricsMatch';
import { downloadCover } from '../services/catalogue';
import { searchDeezer } from '../services/musicBrainz';
import { readArtwork } from '../data/artwork';
import type { ArtistProfile, Track } from '../domain/types';

export function useArtistPhotos(
  tracks: Track[],
  profiles: ArtistProfile[],
  save: (name: string, artwork: string) => Promise<boolean>,
) {
  const [progress, setProgress] = useState<{ done: number; total: number; found: number } | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  const attempted = useRef(new Set<string>());
  const [searching, setSearching] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = useCallback(() => controller.current?.abort(), []);
  const find = useCallback(
    async (onlyNew = false) => {
      if (controller.current) return;
      const known = new Set(
        profiles.filter((item) => item.artwork).map((item) => canonical(item.name)),
      );
      const names = new Map<string, string>();
      for (const track of tracks) {
        const name = track.artist.trim();
        const key = canonical(name);
        if (
          key &&
          key !== 'unknown artist' &&
          !known.has(key) &&
          (!onlyNew || !attempted.current.has(key))
        )
          names.set(key, name);
      }
      const all = [...names.values()];
      if (!all.length) return;
      const abort = new AbortController();
      controller.current = abort;
      setSearching(true);
      let done = 0,
        found = 0;
      setProgress({ done, total: all.length, found });
      try {
        for (const name of all) {
          if (abort.signal.aborted) break;
          const key = canonical(name);
          attempted.current.add(key);
          const results = await searchDeezer(name, abort.signal);
          if (abort.signal.aborted) {
            attempted.current.delete(key);
            break;
          }
          const match = results.find(
            (item) => canonical(item.artist) === canonical(name) && item.artistArtworkUrl,
          );
          if (match?.artistArtworkUrl && !abort.signal.aborted) {
            const image = await downloadCover(match.artistArtworkUrl, abort.signal);
            if (image && !abort.signal.aborted) {
              try {
                const artwork = await readArtwork(image);
                if (!abort.signal.aborted && (await save(name, artwork))) found++;
              } catch {}
            }
          }
          if (abort.signal.aborted) {
            attempted.current.delete(key);
            break;
          }
          setProgress({ done: ++done, total: all.length, found });
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      } finally {
        controller.current = null;
        if (abort.signal.aborted) setProgress(null);
        setSearching(false);
      }
    },
    [tracks, profiles, save],
  );
  return { find, cancel, progress, searching };
}
