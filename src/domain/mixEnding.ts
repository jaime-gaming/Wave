import type { EnergyEnvelope } from './musicEnergy';

/**
 * The outgoing song does not always end the same way. A long recorded fade asks
 * to be followed all the way to silence; a ringing tail that is still audible
 * when the file stops asks for a short echo-like handover and an early cut.
 *
 * The decision is local and bounded: the web reads the tail of the low-rate
 * decoded envelope it already owns, while the native clients read the same kind
 * of ending evidence from their own duration and LRC timings. Nothing here
 * changes the stored audio and no timer is started.
 */
export type EndingShape = 'fade-to-zero' | 'echo-cut';

/** The echo-like tail is cut at exactly 75 % of the full fade, before zero. */
export const ECHO_CUT_FRACTION = 0.75;

export interface EndingEvidence {
  duration: number;
  /** Last timed lyric, when the listener has an LRC file. */
  lastLyric?: number;
  /** Optional tempo tag; a short final bar supports an abrupt tail. */
  bpm?: number;
}

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

const smoothstep = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** Staged, equal-power arrival: the shared base curve for both endings. */
export function stagedGains(progress: number): { outgoing: number; incoming: number } {
  const p = clamp(progress);
  const phase =
    p < 0.28
      ? 0.5 * smoothstep(p / 0.28)
      : p < 0.62
        ? 0.5 + 0.06 * smoothstep((p - 0.28) / 0.34)
        : 0.56 + 0.44 * smoothstep((p - 0.62) / 0.38);
  return { outgoing: Math.cos((phase * Math.PI) / 2), incoming: Math.sin((phase * Math.PI) / 2) };
}

/** Where the outgoing deck is released for this detected ending. */
export function endingCutProgress(shape: EndingShape): number {
  return shape === 'echo-cut' ? ECHO_CUT_FRACTION : 1;
}

/**
 * Gains for the two decks. A fade reaches zero at the end. The echo ending
 * carries a small decaying ripple, keeps the outgoing song audible through
 * 75 %, and then cuts it while the incoming song is already at full level.
 */
export function endingGains(
  progress: number,
  shape: EndingShape,
): { outgoing: number; incoming: number } {
  const p = clamp(progress);
  const base = stagedGains(p);
  if (shape === 'fade-to-zero') return base;
  const cut = ECHO_CUT_FRACTION;
  if (p >= cut) return { outgoing: 0, incoming: 1 };
  const atCut = stagedGains(cut);
  // Three quiet repeats over the available tail; the ripple itself decays, so
  // the cut is heard as the end of an echo rather than as a volume jump.
  const ripple = 1 + 0.1 * Math.exp(-3 * p) * Math.cos(6 * Math.PI * p);
  return {
    outgoing: clamp(base.outgoing * ripple),
    incoming: clamp(base.incoming / Math.max(0.001, atCut.incoming)),
  };
}

/**
 * Native-style detection from the evidence every platform has: duration, the
 * last timed lyric and an optional tempo tag. A voice still near the end means
 * there is no long recorded fade to follow; a long instrumental outro does.
 */
export function detectEndingFromEvidence(evidence: EndingEvidence): EndingShape {
  const { duration, lastLyric, bpm } = evidence;
  if (!Number.isFinite(duration) || duration < 8 || !Number.isFinite(lastLyric) || !lastLyric)
    return 'fade-to-zero';
  const instrumentalTail = duration - Math.max(0, lastLyric);
  const bar = Number.isFinite(bpm) && bpm! >= 60 ? 240 / bpm! : 2;
  const shortTail = Math.max(4, Math.min(8, 2 * bar));
  return instrumentalTail <= shortTail ? 'echo-cut' : 'fade-to-zero';
}

/**
 * Reads the last seconds of a decoded amplitude envelope. A smooth descent
 * into the floor is a fade; a still-audible tail with decaying peaks and a
 * sudden edge is an echo-like cut. All scans are bounded to at most 12 s.
 */
export function detectEndingShape(
  envelope: EnergyEnvelope | undefined,
  duration: number,
  audibleEnd = duration,
  evidence?: EndingEvidence,
): EndingShape {
  const metadata = evidence ? detectEndingFromEvidence(evidence) : 'fade-to-zero';
  if (!envelope || !Number.isFinite(duration) || duration < 8) return metadata;
  const { values, step } = envelope;
  if (!Number.isFinite(step) || step <= 0 || values.length < 40) return metadata;
  const end = Math.min(duration, Math.max(0, Number.isFinite(audibleEnd) ? audibleEnd : duration));
  const tailSeconds = Math.min(12, Math.max(4, end / 8));
  const from = Math.max(0, Math.round((end - tailSeconds) / step));
  const to = Math.min(values.length - 1, Math.round(end / step));
  if (to - from < 20) return metadata;

  const tail: number[] = [];
  for (let index = from; index <= to; index++) {
    const value = values[index];
    tail.push(Number.isFinite(value) ? Math.max(0, value) : 0);
  }
  const sorted = [...tail].sort((a, b) => a - b);
  const reference = Math.max(0.01, sorted[Math.floor(sorted.length * 0.8)] ?? 0);
  const mean = (values: number[]) =>
    values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  const lastFrames = tail.slice(-Math.max(2, Math.round(0.4 / step)));
  const afterFrames: number[] = [];
  for (
    let index = to + 1;
    index <= Math.min(values.length - 1, to + Math.round(0.6 / step));
    index++
  ) {
    afterFrames.push(Number.isFinite(values[index]) ? Math.max(0, values[index]) : 0);
  }
  const endingRatio = mean(lastFrames) / reference;
  // A file that stops on the last sample has no trailing frames: its edge is
  // implicitly silent. A long tail of zeros after the music is also a cut.
  const following = afterFrames.length ? mean(afterFrames) / reference : 0;
  let falling = 0;
  let peaks = 0;
  for (let index = 1; index < tail.length; index++) {
    if (tail[index] <= tail[index - 1]) falling++;
    if (
      index > 0 &&
      index + 1 < tail.length &&
      tail[index] > tail[index - 1] &&
      tail[index] >= tail[index + 1] &&
      tail[index] > reference * 0.08
    )
      peaks++;
  }
  const fallingShare = falling / Math.max(1, tail.length - 1);
  const quietEnd = endingRatio < 0.1 && fallingShare > 0.55 && peaks < 4;
  const abruptEnd =
    endingRatio > 0.16 &&
    following < Math.max(0.08, endingRatio * 0.35) &&
    (peaks >= 1 || fallingShare < 0.75);
  if (quietEnd) return 'fade-to-zero';
  if (abruptEnd) return 'echo-cut';
  return metadata;
}
