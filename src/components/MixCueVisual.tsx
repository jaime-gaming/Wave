import type { CSSProperties } from 'react';
import { Artwork } from './Artwork';
import type { MixCue } from '../ui/mixCue';
import { useT } from '../i18n';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function MixCueVisual({
  cue,
  artworkClassName = 'player-artwork',
}: {
  cue: MixCue;
  artworkClassName?: string;
}) {
  const progress = clamp01(cue.progress);

  const breath = smooth(progress);
  const style = { '--cue-progress': progress, '--cue-breath': breath } as CSSProperties;
  return (
    <div className="mix-cue" aria-hidden="true" style={style}>
      <div className="mix-cue-cover">
        <Artwork track={cue.from} className={artworkClassName} />
      </div>
    </div>
  );
}

export function MixCueLabel({ cue }: { cue: MixCue }) {
  const t = useT();
  return (
    <span
      className="mix-cue-label"
      role="status"
      aria-label={t('Mixing into {title} by {artist}', {
        title: cue.to.title,
        artist: cue.to.artist,
      })}
    >
      <span className="mix-cue-word" aria-hidden="true">
        {t('Mixing')}
      </span>
    </span>
  );
}
