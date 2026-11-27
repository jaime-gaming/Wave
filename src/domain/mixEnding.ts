import type { EnergyEnvelope } from './musicEnergy';

export type EndingShape = 'fade-to-zero' | 'echo-cut';

export interface EndingEvidence {
  duration: number;

  lastLyric?: number;

  bpm?: number;
}

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

const smoothstep = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

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

export function endingCutProgress(_shape: EndingShape): number {
  void _shape;
  return 1;
}

export function endingGains(
  progress: number,
  _shape: EndingShape,
): { outgoing: number; incoming: number } {
  void _shape;
  return stagedGains(progress);
}

export function detectEndingFromEvidence(evidence: EndingEvidence): EndingShape {
  const { duration, lastLyric, bpm } = evidence;
  if (!Number.isFinite(duration) || duration < 8 || !Number.isFinite(lastLyric) || !lastLyric)
    return 'fade-to-zero';
  const instrumentalTail = duration - Math.max(0, lastLyric);
  const bar = Number.isFinite(bpm) && bpm! >= 60 ? 240 / bpm! : 2;
  const shortTail = Math.max(4, Math.min(8, 2 * bar));
  return instrumentalTail <= shortTail ? 'echo-cut' : 'fade-to-zero';
}

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
