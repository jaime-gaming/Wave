import { useEffect, useState } from 'react';
import { Film, Loader2, Trash2 } from 'lucide-react';
import { searchClips, chooseClip } from '../services/clipSearch';
import { CLIPS_CHANGED, getClip, loadClips, removeClip } from '../domain/videoClips';
import { youtubeThumbnailUrl } from '../domain/youtube';
import type { ClipCandidate } from '../domain/clipSearch';
import type { Track } from '../domain/types';

/**
 * The clip for this song, and a way to change your mind.
 *
 * Automatic discovery is a guess, and a guess you cannot correct is worse than
 * no guess: this shows which video was picked, offers the runners-up, lets the
 * clip start a few seconds in when it has an intro, and can remove it entirely.
 * Everything is stored on this device and keyed by the song; nothing is uploaded.
 */
export function ClipSection({ track }: { track: Track }) {
  const [clip, setClip] = useState(() => getClip(track.id, loadClips()));
  const [status, setStatus] = useState<'idle' | 'searching' | 'empty' | 'unavailable'>('idle');
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [offset, setOffset] = useState(clip?.startAt ?? 0);

  useEffect(() => {
    const sync = () => {
      const next = getClip(track.id, loadClips());
      setClip(next);
      setOffset(next?.startAt ?? 0);
    };
    window.addEventListener(CLIPS_CHANGED, sync);
    return () => window.removeEventListener(CLIPS_CHANGED, sync);
  }, [track.id]);

  const search = async () => {
    setStatus('searching');
    setCandidates([]);
    const result = await searchClips({
      title: track.title,
      artist: track.artist,
      duration: track.duration,
    });
    setCandidates(result.candidates);
    setStatus(result.status === 'found' ? 'idle' : result.status);
  };

  const pick = (candidate: ClipCandidate, startAt = 0) => {
    chooseClip(track.id, candidate, startAt);
    setCandidates([]);
    window.dispatchEvent(new Event(CLIPS_CHANGED));
  };

  return (
    <section className="clip-section" aria-label="Video clip">
      <header>
        <Film size={17} aria-hidden="true" />
        <strong>Video clip</strong>
      </header>
      {clip ? (
        <>
          <div className="clip-current">
            <img src={youtubeThumbnailUrl(clip.videoId)} alt="" width={72} height={40} />
            <span>
              <small>Playing behind this song</small>
              <a
                href={`https://www.youtube.com/watch?v=${clip.videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                youtube.com/watch?v={clip.videoId}
              </a>
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove video clip"
              onClick={() => {
                removeClip(track.id);
                window.dispatchEvent(new Event(CLIPS_CHANGED));
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <label className="clip-offset">
            <span>Clip starts at</span>
            <input
              type="number"
              min={0}
              max={3600}
              step={1}
              value={offset}
              onChange={(event) => setOffset(Math.max(0, Number(event.target.value) || 0))}
              onBlur={() =>
                pick({ videoId: clip.videoId, title: '', author: '', duration: 0 }, offset)
              }
            />
            <span>s</span>
          </label>
        </>
      ) : (
        <p className="clip-empty">No clip yet. Wave looks for one by itself.</p>
      )}
      <div className="clip-actions">
        <button
          type="button"
          className="text-button"
          disabled={status === 'searching'}
          onClick={() => void search()}
        >
          {status === 'searching' ? <Loader2 size={16} className="spin" /> : null}
          {clip ? 'Choose another' : 'Find a clip'}
        </button>
      </div>
      {status === 'empty' && (
        <p className="clip-empty" role="status">
          Nothing matched this song closely enough.
        </p>
      )}
      {status === 'unavailable' && (
        <p className="clip-empty" role="status">
          The clip search is unreachable right now.
        </p>
      )}
      {!!candidates.length && (
        <ul className="clip-choices">
          {candidates.map((candidate) => (
            <li key={candidate.videoId}>
              <button type="button" onClick={() => pick(candidate)}>
                <img src={youtubeThumbnailUrl(candidate.videoId)} alt="" width={72} height={40} />
                <span>
                  <strong>{candidate.title}</strong>
                  <small>{candidate.author}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
