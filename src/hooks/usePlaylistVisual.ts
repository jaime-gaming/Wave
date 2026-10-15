import { useEffect, useMemo, useState } from 'react';
import type { Playlist, Track } from '../domain/types';
import { playlistIcon } from '../domain/playlistVisual';

const samples = new Map<string, Promise<string | undefined>>();
function sample(artwork: string): Promise<string | undefined> {
  const cached = samples.get(artwork);
  if (cached) return cached;
  const promise = new Promise<string | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const x = c.getContext('2d');
        if (!x) return resolve(undefined);
        x.drawImage(image, 0, 0, 8, 8);
        const pixels = x.getImageData(0, 0, 8, 8).data;
        let r = 0,
          g = 0,
          b = 0,
          n = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 128) continue;
          r += pixels[i];
          g += pixels[i + 1];
          b += pixels[i + 2];
          n++;
        }
        resolve(
          n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : undefined,
        );
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(undefined);
    image.src = artwork;
  });
  if (samples.size >= 64) samples.delete(samples.keys().next().value!);
  samples.set(artwork, promise);
  return promise;
}
export function usePlaylistVisual(playlist: Playlist, tracks: Track[] = []) {
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const artworks = useMemo(
    () =>
      [
        ...new Set(
          playlist.trackIds.flatMap((id) => {
            const artwork = byId.get(id)?.artwork;
            return artwork ? [artwork] : [];
          }),
        ),
      ].slice(0, 12),
    [playlist.trackIds, byId],
  );
  const signature = JSON.stringify(artworks);
  const [resolved, setResolved] = useState<{ key: string; colors: string[] }>({
    key: '',
    colors: [],
  });
  useEffect(() => {
    let active = true;
    if (playlist.artwork || !artworks.length) return;
    void Promise.all(artworks.map(sample)).then((colors) => {
      if (active) setResolved({ key: signature, colors: colors.filter((c): c is string => !!c) });
    });
    return () => {
      active = false;
    };
  }, [signature, artworks, playlist.artwork]);
  const colors = useMemo(
    () => (resolved.key === signature ? resolved.colors : []),
    [resolved, signature],
  );
  const artwork = useMemo(
    () => playlist.artwork ?? playlistIcon(playlist.id, playlist.name, colors),
    [playlist.artwork, playlist.id, playlist.name, colors],
  );
  return {
    artwork,
    colors,
    background: colors.length
      ? `linear-gradient(125deg,${colors.join(',')}${colors.length === 1 ? ',' + colors[0] : ''})`
      : undefined,
  };
}
