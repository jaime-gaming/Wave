/**
 * The dead air at the edges of a file.
 *
 * Ripped vinyl, live recordings and careless exports often open with two or
 * three seconds of nothing and close with a long fade to nothing. It is not a
 * fault in the music and it is not the library's business to hide it, but the
 * listener deserves to know it is there and to be able to skip it.
 *
 * Nothing here touches a byte of the file. A trim is a pair of bounds the player
 * obeys: the recording keeps its silence, the library simply stops before it.
 * That is why this is safe to offer at all.
 *
 * The margins matter more than the detection. Cutting exactly at the first
 * audible frame clips the attack of the first note, which is the one thing that
 * would make a trim worse than the silence.
 */
export interface SilenceBounds {
  /** First audible moment, in seconds from the start of the file. */
  start: number;
  /** Last audible moment, in seconds from the start of the file. */
  end: number;
}

export interface SilenceReport extends SilenceBounds {
  /** Everything the file spends silent before the music. */
  leading: number;
  /** Everything it spends silent after the music. */
  trailing: number;
  /** Whether the silence is long enough to be worth mentioning. */
  worth: boolean;
}

/**
 * How much dead air has to be there before it is worth a word.
 *
 * Two and a half seconds at the front and four at the back. Asking about edges
 * that are nearly there is the way this feature becomes noise: every recording
 * breathes for a second, and being offered a trim for it teaches the listener to
 * ignore the offer. Long enough to be unmistakably dead air, and it is one line.
 */
export const SILENCE_MIN_START = 2.5;
export const SILENCE_MIN_END = 4;
/** Kept on each side so a trim never shaves the first attack or the last tail. */
export const SILENCE_MARGIN = 0.25;

const round = (value: number) => Math.round(value * 10) / 10;

export function silenceReport(
  analysis: { duration: number; trimmed: SilenceBounds } | undefined,
): SilenceReport | null {
  if (!analysis || !Number.isFinite(analysis.duration) || analysis.duration <= 0) return null;
  const start = Math.max(0, Math.min(analysis.trimmed.start, analysis.duration));
  const end = Math.max(
    start,
    Math.min(analysis.trimmed.end || analysis.duration, analysis.duration),
  );
  const leading = round(start);
  const trailing = round(Math.max(0, analysis.duration - end));
  return {
    start,
    end,
    leading,
    trailing,
    worth: leading >= SILENCE_MIN_START || trailing >= SILENCE_MIN_END,
  };
}

/**
 * What playing this song from end to end actually means.
 *
 * A trim keeps its margins: the listener asked for the silence to go, not for
 * the first fraction of a second of the song to go with it.
 */
export function playableBounds(duration: number, trim: SilenceBounds | undefined): SilenceBounds {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!trim) return { start: 0, end: safeDuration };
  const start = Math.max(0, Math.min(trim.start, safeDuration));
  const end = Math.max(start, Math.min(trim.end, safeDuration));
  return { start, end: end || safeDuration };
}

/** The bounds a listener would get by accepting the report. */
export function trimFromReport(report: SilenceReport): SilenceBounds {
  return {
    start: Math.max(0, round(report.leading - SILENCE_MARGIN)),
    end: Math.max(0, round(report.end + SILENCE_MARGIN)),
  };
}

/** How the silence is described to a person, in one short line. */
export function describeSilence(report: SilenceReport): string {
  const seconds = (value: number) =>
    value >= 10 ? `${Math.round(value)} seconds` : `${value.toFixed(1)} seconds`;
  if (report.leading >= SILENCE_MIN_START && report.trailing >= SILENCE_MIN_END)
    return `${seconds(report.leading)} of silence at the start and ${seconds(report.trailing)} at the end`;
  if (report.leading >= SILENCE_MIN_START)
    return `${seconds(report.leading)} of silence at the start`;
  return `${seconds(report.trailing)} of silence at the end`;
}
