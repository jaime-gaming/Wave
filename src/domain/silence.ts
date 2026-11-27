export interface SilenceBounds {
  start: number;

  end: number;
}

export interface SilenceReport extends SilenceBounds {
  leading: number;

  trailing: number;

  worth: boolean;
}

export const SILENCE_MIN_START = 2.5;
export const SILENCE_MIN_END = 4;

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

export function playableBounds(duration: number, trim: SilenceBounds | undefined): SilenceBounds {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!trim) return { start: 0, end: safeDuration };
  const start = Math.max(0, Math.min(trim.start, safeDuration));
  const end = Math.max(start, Math.min(trim.end, safeDuration));
  return { start, end: end || safeDuration };
}

export function trimFromReport(report: SilenceReport): SilenceBounds {
  return {
    start: Math.max(0, round(report.leading - SILENCE_MARGIN)),
    end: Math.max(0, round(report.end + SILENCE_MARGIN)),
  };
}

export function describeSilence(report: SilenceReport): string {
  const seconds = (value: number) =>
    value >= 10 ? `${Math.round(value)} seconds` : `${value.toFixed(1)} seconds`;
  if (report.leading >= SILENCE_MIN_START && report.trailing >= SILENCE_MIN_END)
    return `${seconds(report.leading)} of silence at the start and ${seconds(report.trailing)} at the end`;
  if (report.leading >= SILENCE_MIN_START)
    return `${seconds(report.leading)} of silence at the start`;
  return `${seconds(report.trailing)} of silence at the end`;
}
