import {
  harmonicCompatibility,
  introEnd,
  kickStart,
  outroStart,
  overlapsRegion,
  type TrackAnalysis,
} from '../audio/dsp';
import { isRubato, tempoRelation } from '../audio/tempo';
import { alignInstrumentalPulse, instrumentalEdges, pulseGrid } from './instrumentalPulse';
import { stagedGains, type EndingShape } from './mixEnding';
import type { Lyrics } from './lyrics';

export const BEATS_PER_BAR = 4;

export const MAX_STRETCH = 0.16;
export const MIN_BARS = 4;

export const MAX_BARS = 16;

export const RUBATO_SECONDS = 12;

export const TARGET_SECONDS = 20;

export const DRIFT_BEATS = 1.5;

export const MAX_CUE_LEAD = 6;

export const MAX_ENTRY = 32;

export type TransitionMode = 'beatmatched' | 'crossfade' | 'cut';

export interface TransitionOptions {
  bars?: number;

  fallbackSeconds?: number;

  minSeconds?: number;

  vocalTolerance?: number;

  maxStretch?: number;

  ending?: EndingShape;
}

export interface TransitionPlan {
  mode: TransitionMode;

  seconds: number;

  startAt: number;

  cue: number;

  bassSwapAt: number;

  bars: number;

  phaseAligned: boolean;

  harmonicScore?: number;

  compatibility?: number;

  vocalOverlap?: boolean;

  instrumentalPulseAligned?: boolean;

  ending?: EndingShape;

  notes: string[];
}

export function transitionCompatibility(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
): number {
  if (!outgoing || !incoming) return 0.55;
  const harmonic = harmonicCompatibility(outgoing.key, incoming.key);

  let tempoFit = 0.6;
  if (trusted(outgoing) && trusted(incoming)) {
    const rel = tempoRelation(outgoing.beats.bpm, incoming.beats.bpm);
    tempoFit = Math.max(0.1, Math.min(1, 1 - rel.difference * 3.4));
    if (rel.kind === 'half' || rel.kind === 'double') tempoFit = Math.max(tempoFit, 0.88);
  }

  const a = outgoing.profile;
  const b = incoming.profile;
  const dot = a.bass * b.bass + a.low * b.low + a.mid * b.mid + a.high * b.high;
  const magA = Math.hypot(a.bass, a.low, a.mid, a.high);
  const magB = Math.hypot(b.bass, b.low, b.mid, b.high);

  const similarity = dot / (magA * magB);
  const spectralFit =
    Number.isFinite(similarity) && magA > 0 && magB > 0
      ? Math.max(0, Math.min(1, similarity))
      : 0.55;

  const score = harmonic * 0.42 + tempoFit * 0.38 + spectralFit * 0.2;
  return Math.round(score * 1000) / 1000;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const barsToSeconds = (bars: number, bpm: number) => (bars * BEATS_PER_BAR * 60) / bpm;

export function automaticBars(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return MIN_BARS;
  const bars = Math.round(TARGET_SECONDS / barsToSeconds(1, bpm) / 4) * 4;
  return clamp(bars, MIN_BARS, MAX_BARS);
}

function hasGrid(analysis: TrackAnalysis): boolean {
  return analysis.beats.confidence >= 0.35 && analysis.beats.bpm >= 60;
}

function trusted(analysis: TrackAnalysis | undefined): analysis is TrackAnalysis {
  return (
    !!analysis &&
    analysis.beats.confidence >= 0.35 &&
    analysis.beats.bpm >= 60 &&
    analysis.beats.bpm <= 200
  );
}

function alignOutgoing(analysis: TrackAnalysis, time: number): number {
  const { bpm, offset } = analysis.beats;
  const period = 60 / bpm;
  const bar = period * BEATS_PER_BAR;
  const barStart = offset + Math.floor((time - offset) / bar) * bar;
  const start = Math.max(analysis.trimmed.start, barStart);
  if (start <= time && time - start < bar) return start;
  const beats = (time - offset) / period;
  return Math.max(analysis.trimmed.start, offset + Math.floor(beats) * period);
}

function maxEntryFor(analysis: TrackAnalysis): number {
  const audible = Math.max(0, analysis.trimmed.end - analysis.trimmed.start);
  return Math.min(MAX_ENTRY, Math.max(0, audible * 0.16));
}

function plannedBassSwapAt(outgoing: TrackAnalysis, incoming: TrackAnalysis): number {
  const diff = (incoming.profile?.bass ?? 0) - (outgoing.profile?.bass ?? 0);
  if (diff > 0.1) return 0.42;
  if (diff < -0.1) return 0.62;
  return 0.5;
}

function alignIncoming(analysis: TrackAnalysis): number {
  const { bpm, offset } = analysis.beats;
  const period = 60 / bpm;
  const start = analysis.trimmed.start;
  const maxEntry = maxEntryFor(analysis);

  const kick = kickStart(analysis, introEnd(analysis));
  const body = clamp(kick ?? introEnd(analysis), start, start + maxEntry);
  const entry = body - start > period ? body : start;
  const skip = !overlapsRegion(analysis.vocals, start, entry, 0.05);
  const from = skip ? entry : start;

  const beats = (from - offset) / period;
  const bar = Math.ceil(beats / BEATS_PER_BAR) * BEATS_PER_BAR;
  const aligned = offset + bar * period;
  return clamp(
    aligned,
    start,
    Math.min(
      start + maxEntry + period * BEATS_PER_BAR,
      Math.max(start, analysis.trimmed.end - period),
    ),
  );
}

function loudEntry(analysis: TrackAnalysis, from: number, length: number): number {
  const { bpm, offset } = analysis.beats;
  const period = 60 / bpm;
  const bodies = analysis.segments.filter((segment) => segment.kind === 'body');
  if (!bodies.length) return from;
  const loudest = Math.max(...bodies.map((segment) => segment.level));
  if (!(loudest > 0)) return from;
  const levelAt = (time: number) => {
    const segment = analysis.segments.find((entry) => entry.start <= time && entry.end > time);
    return segment ? segment.level : 0;
  };
  if (levelAt(from) >= loudest * 0.55) return from;
  const entryCeiling = analysis.trimmed.start + maxEntryFor(analysis) + period * BEATS_PER_BAR;
  const cap = Math.min(
    from + Math.max(MAX_CUE_LEAD, period),
    entryCeiling,
    analysis.trimmed.end - period,
  );

  const firstBar = Math.ceil((from - offset) / period / BEATS_PER_BAR);
  for (let step = 1; step <= 8; step++) {
    const time = offset + (firstBar + step) * BEATS_PER_BAR * period;
    if (time > cap || time + length > analysis.trimmed.end) break;
    if (levelAt(time) >= loudest * 0.55) return time;
  }
  return from;
}

function findClearEntry(analysis: TrackAnalysis, from: number, length: number): number | null {
  const { bpm, offset } = analysis.beats;
  const period = 60 / bpm;
  const barPeriod = period * BEATS_PER_BAR;
  const first = Math.ceil((from - offset) / barPeriod);
  const cap = from + Math.max(MAX_CUE_LEAD, period);
  for (let step = 0; step < 8; step++) {
    const time = offset + (first + step) * barPeriod;
    if (time > cap || time + length > analysis.trimmed.end) break;
    if (!overlapsRegion(analysis.vocals, time, time + length, 0.15)) return time;
  }
  return null;
}

function buildTransitionPlan(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
  options: TransitionOptions = {},
): TransitionPlan {
  const fallbackSeconds = Math.max(1, options.fallbackSeconds ?? 6);
  const minSeconds = Math.max(0.5, options.minSeconds ?? 1.5);
  const vocalTolerance = options.vocalTolerance ?? 0.15;
  const maxStretch = clamp(options.maxStretch ?? MAX_STRETCH, 0, 0.2);
  const notes: string[] = [];

  const fallback = (reason: string): TransitionPlan => {
    notes.push(reason);
    const harmonicScore =
      outgoing && incoming ? harmonicCompatibility(outgoing.key, incoming.key) : undefined;
    const compatibility =
      outgoing && incoming ? transitionCompatibility(outgoing, incoming) : undefined;
    if (!outgoing || !incoming) {
      return {
        mode: 'cut',
        seconds: 0,
        startAt: outgoing?.trimmed.end ?? 0,
        cue: incoming?.trimmed.start ?? 0,
        bassSwapAt: 0.5,
        bars: 0,
        phaseAligned: false,
        notes,
      };
    }
    const audibleTail = outgoing.trimmed.end - outgoing.trimmed.start;
    const clashTighten = harmonicScore !== undefined && harmonicScore < 0.42 ? 0.72 : 1;
    const seconds = Math.min(fallbackSeconds * clashTighten, Math.max(minSeconds, audibleTail / 2));
    const startAt = Math.max(outgoing.trimmed.start, outgoing.trimmed.end - seconds);
    const cue = Math.max(0, incoming.trimmed.start);
    const vocalOverlap =
      overlapsRegion(outgoing.vocals, startAt, startAt + seconds, vocalTolerance) &&
      overlapsRegion(incoming.vocals, cue, cue + seconds, vocalTolerance);
    return {
      mode: 'crossfade',
      seconds: Math.round(seconds * 100) / 100,
      startAt,
      cue,
      bassSwapAt: plannedBassSwapAt(outgoing, incoming),
      bars: 0,
      phaseAligned: false,
      harmonicScore,
      compatibility,
      vocalOverlap,
      notes,
    };
  };

  if (!outgoing || !incoming) return fallback('No analysis available for one of the songs.');
  const harmonicScore = harmonicCompatibility(outgoing.key, incoming.key);
  const compatibility = transitionCompatibility(outgoing, incoming);

  const gentle = (reason: string): TransitionPlan => {
    notes.push(reason);
    const tail = outgoing.trimmed.end - outgoing.trimmed.start;
    const head = incoming.trimmed.end - incoming.trimmed.start;

    const seconds = Math.max(0.5, Math.min(RUBATO_SECONDS, tail, head, Math.max(minSeconds, tail)));

    const start = hasGrid(outgoing)
      ? alignOutgoing(outgoing, outgoing.trimmed.end - seconds)
      : Math.max(outgoing.trimmed.start, outgoing.trimmed.end - seconds);

    const maxGentleSkip = Math.min(6, head * 0.08);
    const introTarget = kickStart(incoming) ?? introEnd(incoming);
    const hasEarlyVocal = overlapsRegion(
      incoming.vocals,
      incoming.trimmed.start,
      incoming.trimmed.start + maxGentleSkip,
      0.05,
    );
    const cue = hasEarlyVocal
      ? incoming.trimmed.start
      : clamp(
          introTarget,
          incoming.trimmed.start,
          Math.min(
            incoming.trimmed.start + maxGentleSkip,
            Math.max(incoming.trimmed.start, incoming.trimmed.end - seconds),
          ),
        );
    const vocalOverlap =
      overlapsRegion(outgoing.vocals, start, start + seconds, vocalTolerance) &&
      overlapsRegion(incoming.vocals, cue, cue + seconds, vocalTolerance);
    return {
      mode: 'crossfade',
      seconds: Math.round(seconds * 100) / 100,
      startAt: Math.round(start * 1000) / 1000,
      cue: Math.round(cue * 1000) / 1000,
      bassSwapAt: plannedBassSwapAt(outgoing, incoming),
      bars: 0,
      phaseAligned: false,
      harmonicScore,
      compatibility,
      vocalOverlap,
      notes,
    };
  };
  if (isRubato(outgoing.beats) || isRubato(incoming.beats))
    return gentle(
      'The pulse is not steady enough to beatmatch: blending gently instead of on a grid.',
    );
  if (!trusted(outgoing) || !trusted(incoming))
    return fallback('No trusted beat grid: using an equal-power crossfade.');

  const bpmA = outgoing.beats.bpm;
  const bpmB = incoming.beats.bpm;

  const relation = tempoRelation(bpmA, bpmB);

  const rawRatio = bpmA / bpmB;
  // Folded BPMs can land on opposite sides of the fold boundary even when
  // the recorded tempos are close. Only the raw ratio establishes an octave.
  const octave = Math.abs(rawRatio / 2 - 1) <= 0.03 || Math.abs(rawRatio * 2 - 1) <= 0.03;
  const stretchNeeded = relation.difference;

  const stretchable = stretchNeeded <= maxStretch;

  if (octave)
    notes.push(
      `Half-time relation: ${bpmB.toFixed(1)} and ${bpmA.toFixed(1)} BPM are the same pulse at twice the speed; both play at their own tempo.`,
    );
  else if (stretchable && stretchNeeded > 0.004)
    notes.push(
      `Close tempos: ${bpmB.toFixed(1)} and ${bpmA.toFixed(1)} BPM; neither song is stretched, the entry is on the bar.`,
    );
  else
    notes.push(
      `Tempo gap of ${(stretchNeeded * 100).toFixed(1)} %: both songs keep their own tempo.`,
    );

  let bars =
    options.bars === undefined
      ? automaticBars(bpmA)
      : clamp(Math.round(options.bars), MIN_BARS, MAX_BARS);
  const audibleTail = Math.max(0, outgoing.trimmed.end - outgoing.trimmed.start);
  const maxByTail = Math.floor(audibleTail / barsToSeconds(1, bpmA));
  bars = Math.min(bars, Math.max(0, maxByTail));

  // A half/double-time relation is not necessarily exact: account for the
  // residual tempo difference instead of assuming the grids never drift.
  const effectiveBpmB = octave ? (rawRatio > 1 ? bpmB * 2 : bpmB / 2) : bpmB;
  const driftPerSecond = Math.abs(1 - effectiveBpmB / bpmA);
  if (driftPerSecond > 0) {
    const allowed = (DRIFT_BEATS * 60) / bpmA / driftPerSecond;
    const driftedBars = Math.max(0, Math.floor(allowed / barsToSeconds(1, bpmA)));
    if (driftedBars < bars) {
      bars = driftedBars;
      notes.push(
        `Tempo gap of ${(driftPerSecond * 100).toFixed(1)} %: the overlap is cut to ${bars} bars so the two pulses stay together.`,
      );
    }
  }

  if (outgoing.key && incoming.key) {
    if (harmonicScore >= 0.85) {
      notes.push(
        `Harmonic match (${outgoing.key.camelot} -> ${incoming.key.camelot}): letting both records breathe together.`,
      );
    } else if (harmonicScore < 0.42 && options.bars === undefined) {
      const tightBars = Math.max(2, Math.min(bars, 4));
      if (tightBars < bars) {
        bars = tightBars;
        notes.push(
          `Key clash (${outgoing.key.camelot} -> ${incoming.key.camelot}): tightening the handover to ${bars} bars so harmonies stay clean.`,
        );
      }
    }
  }
  if (bars < 2)
    return fallback('The outgoing song has too little audible tail left for a bar-aligned mix.');

  let seconds = barsToSeconds(bars, bpmA);
  if (seconds < minSeconds) return fallback('The overlap would be too short to sound intentional.');

  const naturalOutro = outroStart(outgoing);
  const idealEndStart = outgoing.trimmed.end - seconds;
  const useOutroAnchor =
    naturalOutro >= idealEndStart - barsToSeconds(2, bpmA) &&
    naturalOutro <= idealEndStart + 1.5 &&
    naturalOutro + seconds <= outgoing.trimmed.end + 0.05 &&
    !overlapsRegion(outgoing.vocals, naturalOutro, naturalOutro + seconds, vocalTolerance);
  let startAt = alignOutgoing(outgoing, useOutroAnchor ? naturalOutro : idealEndStart);
  if (startAt + seconds > outgoing.trimmed.end + 0.05)
    return fallback('The overlap would run past the end of the song.');

  let cue = loudEntry(incoming, alignIncoming(incoming), seconds);
  let phaseAligned = true;
  if (overlapsRegion(incoming.vocals, cue, cue + seconds, vocalTolerance)) {
    const clear = findClearEntry(incoming, cue, seconds);
    if (clear !== null) {
      cue = clear;
      notes.push('Incoming entry moved to a bar without a prominent vocal.');
    } else {
      bars = Math.max(2, Math.floor(bars / 2));
      seconds = barsToSeconds(bars, bpmA);
      // Shortening must not fade out well before the outgoing song ends.
      startAt = alignOutgoing(outgoing, outgoing.trimmed.end - seconds);
      notes.push('A prominent incoming vocal needs space: the overlap is halved.');
    }
  }
  const outgoingHasVocal = overlapsRegion(
    outgoing.vocals,
    startAt,
    startAt + seconds,
    vocalTolerance,
  );
  const incomingHasVocal = overlapsRegion(incoming.vocals, cue, cue + seconds, vocalTolerance);
  const vocalOverlap = outgoingHasVocal && incomingHasVocal;
  if (outgoingHasVocal)
    notes.push(
      'The outgoing song still has a vocal in the overlap; carving its midrange pocket and fading the low band cleanly.',
    );

  if (cue + seconds > incoming.trimmed.end) {
    const available = incoming.trimmed.end - cue;
    if (available < minSeconds)
      return fallback('The incoming song has no room left after its intro.');
    seconds = available;
    phaseAligned = false;
  }

  const baseSwap = plannedBassSwapAt(outgoing, incoming);
  const bassSwapAt = harmonicScore < 0.42 ? Math.min(baseSwap, 0.42) : baseSwap;

  const plan: TransitionPlan = {
    mode: 'beatmatched',
    seconds: Math.round(seconds * 100) / 100,
    startAt: Math.round(startAt * 1000) / 1000,
    cue: Math.round(cue * 1000) / 1000,
    bassSwapAt,
    bars,
    phaseAligned,
    harmonicScore,
    compatibility,
    vocalOverlap,
    notes,
  };

  const edges = instrumentalEdges(outgoing, incoming);
  const gridA = edges ? pulseGrid(outgoing) : undefined;
  const gridB = edges ? pulseGrid(incoming) : undefined;
  const aligned =
    edges && gridA && gridB
      ? alignInstrumentalPulse(edges, gridA, gridB, {
          startAt: plan.startAt,
          cue: plan.cue,
          seconds: plan.seconds,
          maxCue: incoming.trimmed.start + maxEntryFor(incoming) + (BEATS_PER_BAR * 60) / bpmB,
          minSeconds,
          driftPerSecond,
          driftBeats: DRIFT_BEATS,
        })
      : undefined;
  if (!aligned) return plan;
  return {
    ...plan,
    seconds: aligned.seconds,
    startAt: aligned.startAt,
    cue: aligned.cue,
    bars: aligned.bars,
    instrumentalPulseAligned: true,
    vocalOverlap:
      overlapsRegion(
        outgoing.vocals,
        aligned.startAt,
        aligned.startAt + aligned.seconds,
        vocalTolerance,
      ) &&
      overlapsRegion(incoming.vocals, aligned.cue, aligned.cue + aligned.seconds, vocalTolerance),
    notes: [...notes, ...aligned.notes],
  };
}

export function planTransition(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
  options: TransitionOptions = {},
): TransitionPlan {
  const plan = buildTransitionPlan(outgoing, incoming, options);
  if (!options.ending || plan.mode === 'cut') return plan;
  return {
    ...plan,
    ending: options.ending,
    notes: [
      ...plan.notes,
      options.ending === 'echo-cut'
        ? 'The outgoing tail rings out gently through the end of the fade.'
        : 'The outgoing tail fades naturally to zero.',
    ],
  };
}

function levelAround(
  analysis: TrackAnalysis | undefined,
  seconds: number,
  window = 12,
): number | undefined {
  if (!analysis) return undefined;
  const from = seconds,
    to = seconds + window;
  const inside = analysis.segments.filter(
    (segment) =>
      segment.kind === 'body' && segment.level > 0.01 && segment.end > from && segment.start < to,
  );
  if (!inside.length) return undefined;

  let total = 0,
    weight = 0;
  for (const segment of inside) {
    const share = Math.min(segment.end, to) - Math.max(segment.start, from);
    if (share <= 0) continue;
    total += segment.level * share;
    weight += share;
  }
  return weight > 0 ? total / weight : undefined;
}

export function levelTrim(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
  at?: { outgoing: number; incoming: number },
): { outgoing: number; incoming: number } {
  const meanBody = (analysis: TrackAnalysis | undefined) => {
    if (!analysis) return undefined;
    const levels = analysis.segments
      .filter((segment) => segment.kind === 'body' && segment.level > 0.01)
      .map((segment) => segment.level);
    if (!levels.length) return undefined;
    return levels.reduce((total, level) => total + level, 0) / levels.length;
  };
  const a = (at ? levelAround(outgoing, at.outgoing) : undefined) ?? meanBody(outgoing),
    b = (at ? levelAround(incoming, at.incoming) : undefined) ?? meanBody(incoming);
  if (!a || !b) return { outgoing: 1, incoming: 1 };
  const decibels = Math.max(-6, Math.min(6, 20 * Math.log10(b / a)));
  if (!Number.isFinite(decibels) || Math.abs(decibels) < 0.5) return { outgoing: 1, incoming: 1 };
  return decibels > 0
    ? { outgoing: 1, incoming: Math.round(10 ** (-decibels / 20) * 1000) / 1000 }
    : { outgoing: Math.round(10 ** (decibels / 20) * 1000) / 1000, incoming: 1 };
}

export const PAN_SPREAD = 0.32;

export function panSpread(progress: number, role: 'outgoing' | 'incoming'): number {
  const p = clamp(progress, 0, 1);

  const open = p < 0.2 ? smoothstep(p / 0.2) : 1;
  const close = p > 0.66 ? 1 - smoothstep((p - 0.66) / 0.34) : 1;
  const amount = PAN_SPREAD * Math.min(open, close);
  return Number(((role === 'outgoing' ? -amount : amount) || 0).toFixed(3));
}

const planCache = new WeakMap<TrackAnalysis, WeakMap<TrackAnalysis, Map<string, TransitionPlan>>>();

export function planTransitionCached(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
  options: TransitionOptions = {},
): TransitionPlan {
  if (!outgoing || !incoming) return planTransition(outgoing, incoming, options);
  let byIncoming = planCache.get(outgoing);
  if (!byIncoming) {
    byIncoming = new WeakMap();
    planCache.set(outgoing, byIncoming);
  }
  let plans = byIncoming.get(incoming);
  if (!plans) {
    plans = new Map();
    byIncoming.set(incoming, plans);
  }
  const key = [
    options.bars ?? '',
    options.fallbackSeconds ?? '',
    options.minSeconds ?? '',
    options.maxStretch ?? '',
    options.vocalTolerance ?? '',
    options.ending ?? '',
  ].join('|');
  const hit = plans.get(key);
  if (hit) return hit;
  const plan = planTransition(outgoing, incoming, options);
  plans.set(key, plan);
  return plan;
}

export function alignIncomingLyrics(
  plan: TransitionPlan,
  lyrics: Lyrics | undefined,
  start = 0,
): TransitionPlan {
  if (!lyrics || plan.mode === 'cut' || plan.seconds <= 0) return plan;

  if (plan.instrumentalPulseAligned) return plan;
  const first = lyrics.lines
    .filter(
      (line) => line.text.trim() && typeof line.time === 'number' && Number.isFinite(line.time),
    )
    .map((line) => line.time! + lyrics.offsetMs / 1000)
    .filter((time) => time >= Math.max(0, start))
    .sort((a, b) => a - b)[0];
  if (first === undefined) return plan;
  const desired = Math.max(0, start, first - plan.seconds * 0.85);
  if (desired >= plan.cue || plan.cue - desired < 0.1) return plan;
  return {
    ...plan,
    cue: Math.round(desired * 1000) / 1000,
    phaseAligned: false,
    notes: [...plan.notes, 'Incoming vocal approaches full level near its first timed lyric.'],
  };
}

export function realignPlan(plan: TransitionPlan, position: number): TransitionPlan | null {
  if (plan.mode !== 'beatmatched' || plan.seconds <= 0 || plan.bars < 2) return plan;
  if (!Number.isFinite(position)) return plan;
  const bar = plan.seconds / plan.bars;
  const late = position - plan.startAt;
  if (late <= bar * 0.25) return plan;
  const whole = Math.floor(late / bar);
  const skipped = late - whole * bar <= bar * 0.25 ? whole : whole + 1;
  const bars = plan.bars - skipped;

  if (bars < 2) return null;
  return {
    ...plan,
    bars,
    seconds: Math.round(bars * bar * 100) / 100,
    startAt: Math.round((plan.startAt + skipped * bar) * 1000) / 1000,
    notes: [...plan.notes, 'The blend moved to the next bar to stay on the phrase.'],
  };
}

export function isUsablePlan(plan: TransitionPlan, remaining: number): boolean {
  return plan.mode !== 'cut' && plan.seconds >= 0.5 && remaining > 0.25;
}

export const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function planGains(progress: number): { outgoing: number; incoming: number } {
  const p = clamp(progress, 0, 1);
  return { outgoing: Math.cos((p * Math.PI) / 2), incoming: Math.sin((p * Math.PI) / 2) };
}

export function handoverGains(progress: number): { outgoing: number; incoming: number } {
  return stagedGains(progress);
}
