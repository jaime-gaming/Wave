import { useEffect, useState, type CSSProperties } from 'react';

// A coarse local sample is enough for a tonal player surface; artwork never leaves the browser.
export function useArtworkColor(artwork?: string) {
  const [sample, setSample] = useState<{ artwork: string; hue: number; saturation: number } | null>(
    null,
  );
  useEffect(() => {
    if (!artwork) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 12;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, 12, 12);
        const pixels = context.getImageData(0, 0, 12, 12).data;
        let red = 0,
          green = 0,
          blue = 0,
          weight = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i] / 255,
            g = pixels[i + 1] / 255,
            b = pixels[i + 2] / 255;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          const w = chroma + 0.05;
          red += r * w;
          green += g * w;
          blue += b * w;
          weight += w;
        }
        const r = red / weight,
          g = green / weight,
          b = blue / weight;
        const max = Math.max(r, g, b),
          min = Math.min(r, g, b),
          delta = max - min;
        let hue = 220;
        if (delta > 0.01) {
          hue =
            (max === r
              ? ((g - b) / delta) % 6
              : max === g
                ? (b - r) / delta + 2
                : (r - g) / delta + 4) * 60;
          if (hue < 0) hue += 360;
        }
        setSample({
          artwork,
          hue: Math.round(hue),
          saturation: delta < 0.03 ? 8 : Math.min(48, Math.max(24, Math.round(delta * 100))),
        });
      } catch {
        /* A neutral player palette is the fallback for unavailable artwork. */
      }
    };
    image.onerror = () => {
      if (active) setSample({ artwork, hue: 226, saturation: 24 });
    };
    image.src = artwork;
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [artwork]);
  return (
    sample && sample.artwork === artwork
      ? { '--art-hue': sample.hue, '--art-saturation': `${sample.saturation}%` }
      : {}
  ) as CSSProperties;
}
