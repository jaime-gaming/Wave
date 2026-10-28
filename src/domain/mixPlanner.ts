import { introEnd, overlapsRegion, type TrackAnalysis } from '../audio/dsp';

/**
 * Mix planner: decides *how* two songs are joined, before any audio is touched.
 *
 * Order of preference:
 * 1. `beatmatched` — both songs have a trusted beat grid close enough in tempo.
 *    The overlap starts on a beat (ideally a bar), is a whole number of bars
 *    chosen from the tempo so the blend lasts about `TARGET_SECONDS`, bass is
 *    swapped around the midpoint, and the incoming deck is stretched by at most
 *    ±8 % so the two grids stay locked.
 * 2. `crossfade` — no trusted grid, or a tempo gap too large to stretch. An
 *    equal-power overlap of the configured length, still inside audible audio.
 * 3. `cut` — nothing usable (very short files). Normal sequential playback.
 *
 * The plan is a description, never a transformation: Wave never writes audio.
 * Time-stretching is applied to the *playback* of the incoming deck with pitch
 * preserved, and only while the two songs overlap.
 */
export const BEATS_PER_BAR = 4;
export const MAX_STRETCH = 0.08;
export const MIN_BARS = 4;
/** Hard ceiling for an explicit request; Mix itself chooses far fewer bars. */
export const MAX_BARS = 16;
/**
 * How long a blend should last, near enough.
 *
 * Eight seconds was a crossfade: two songs sliding past each other. A mix needs
 * room for the three things a DJ does — bring the new song in, let both play,
 * take the old one out — and that is two to four phrases, so about twenty
 * seconds. Almost four times the playing time of either song stays untouched.
 */
export const TARGET_SECONDS = 20;
/**
 * How far Mix may move the incoming song to land on a downbeat.
 */
export const MAX_CUE_LEAD = 6;
/**
 * How far into a song Mix may start it to reach the first bar with the drums
 * already playing.
 *
 * A record is cued on its first kick, not on its first second. Twenty seconds is
 * enough for the longest atmospheric intro and short enough that no verse, no
 * chorus and no hook can hide in the part that is skipped — and nothing is
 * skipped at all once a voice has been heard.
 */
export const MAX_ENTRY = 20;

export type TransitionMode = 'beatmatched' | 'crossfade' | 'cut';

export interface TransitionOptions {
  /** Overrides the bar count Mix would choose for the tempo; may be shortened. */
  bars?: number;
  /** Length used when the planner falls back to a plain crossfade. */
  fallbackSeconds?: number;
  /** Lower bound: never overlap less than this unless a `cut` is chosen. */
  minSeconds?: number;
  /** A vocal overlap shorter than this is acceptable (a natural handover). */
  vocalTolerance?: number;
  /** BPM difference above which stretching is refused (relative). */
  maxStretch?: number;
}

export interface TransitionPlan {
  mode: TransitionMode;
  /** Overlap length in seconds (0 for a cut). */
  seconds: number;
  /** Position in the outgoing song where the overlap begins. */
  startAt: number;
  /** Position in the incoming song where it starts playing. */
  cue: number;
  /** Playback rate for the incoming deck during the overlap. */
  incomingRate: number;
  /** True when the rate is a tempo change rather than 1.0. */
  stretched: boolean;
  /** Fraction of the overlap after which bass is swapped to the incoming song. */
  bassSwapAt: number;
  /** Bars used, when beat matched. */
  bars: number;
  /** Both tempo and bar phase aligned. */
  phaseAligned: boolean;
  /** Human-readable reasons for the decisions, for tests and logs. */
  notes: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const barsToSeconds = (bars: number, bpm: number) => (bars * BEATS_PER_BAR * 60) / bpm;

/**
 * Bar count for a blend of roughly TARGET_SECONDS at this tempo, in multiples of
 * four bars and inside the range Mix uses.
 */
export function automaticBars(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return MIN_BARS;
  const bars = Math.round(TARGET_SECONDS / barsToSeconds(1, bpm) / 4) * 4;
  return clamp(bars, MIN_BARS, MAX_BARS);
}

function trusted(analysis: TrackAnalysis | undefined): analysis is TrackAnalysis {
  return (
    !!analysis &&
    analysis.beats.confidence >= 0.35 &&
    analysis.beats.bpm >= 60 &&
    analysis.beats.bpm <= 200
  );
}

/**
 * Time in A at or before `time`, on a bar line when one is close enough.
 *
 * Songs are built in bars, not in beats: leaving on a bar is what makes the
 * handover land on a phrase instead of in the middle of one. The bar line is
 * only used when it is inside the audible tail; otherwise the nearest beat is
 * the honest answer.
 */
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

/**
 * Incoming start: the song's first full bar, on a downbeat.
 *
 * This is the one move that separates a mix from two songs played over each
 * other. A song almost always opens with a beatless intro or a single held
 * chord; fading that under the outgoing song gives the join no arrival at all,
 * because the new record has nothing to arrive with. A DJ cues at the first bar
 * where the drums are already playing, and that is `introEnd`.
 *
 * The skip is bounded by `MAX_ENTRY` and forbidden as soon as a voice is present
 * in the part that would be skipped: a song that opens with a sung line starts
 * on its first beat like it always did.
 */
function alignIncoming(analysis: TrackAnalysis): number {
  const { bpm, offset } = analysis.beats;
  const period = 60 / bpm;
  const start = analysis.trimmed.start;
  const body = clamp(introEnd(analysis), start, start + MAX_ENTRY);
  const entry = body - start > period ? body : start;
  const skip = !overlapsRegion(analysis.vocals, start, entry, 0.05);
  const from = skip ? entry : start;
  // Round up to the next bar so the incoming song enters on a downbeat.
  const beats = (from - offset) / period;
  const bar = Math.ceil(beats / BEATS_PER_BAR) * BEATS_PER_BAR;
  const aligned = offset + bar * period;
  return clamp(aligned, start, Math.max(start, analysis.trimmed.end - period));
}

/**
 * First bar-aligned entry, within a short search, where the incoming song has no
 * prominent vocal for the whole overlap. The window is deliberately small: a
 * quieter pickup is nice, skipping a verse to find one is not. Past the window,
 * shortening the overlap is the better answer.
 */
function findClearEntry(analysis: TrackAnalysis, from: number, length: number): number | null {
  const { bpm, offset } = analysis.beats;
  const period = 60 / bpm;
  const first = Math.ceil((from - offset) / period);
  const cap = from + Math.max(MAX_CUE_LEAD, period);
  for (let step = 0; step < BEATS_PER_BAR * 8; step++) {
    const time = offset + (first + step) * period;
    if (time > cap || time + length > analysis.trimmed.end) break;
    if (!overlapsRegion(analysis.vocals, time, time + length, 0.15)) return time;
  }
  return null;
}

/**
 * Builds the transition plan for A → B. `outgoingPosition` is where A currently
 * is, so the planner never schedules a window in the past.
 */
export function planTransition(
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
    if (!outgoing || !incoming) {
      return {
        mode: 'cut',
        seconds: 0,
        startAt: outgoing?.trimmed.end ?? 0,
        cue: incoming?.trimmed.start ?? 0,
        incomingRate: 1,
        stretched: false,
        bassSwapAt: 0.5,
        bars: 0,
        phaseAligned: false,
        notes,
      };
    }
    const audibleTail = outgoing.trimmed.end - outgoing.trimmed.start;
    const seconds = Math.min(fallbackSeconds, Math.max(minSeconds, audibleTail / 2));
    return {
      mode: 'crossfade',
      seconds: Math.round(seconds * 100) / 100,
      startAt: Math.max(outgoing.trimmed.start, outgoing.trimmed.end - seconds),
      cue: Math.max(0, incoming.trimmed.start),
      incomingRate: 1,
      stretched: false,
      bassSwapAt: 0.5,
      bars: 0,
      phaseAligned: false,
      notes,
    };
  };

  if (!outgoing || !incoming) return fallback('No analysis available for one of the songs.');
  if (!trusted(outgoing) || !trusted(incoming))
    return fallback('No trusted beat grid: using an equal-power crossfade.');

  const bpmA = outgoing.beats.bpm;
  const bpmB = incoming.beats.bpm;
  const rate = bpmA / bpmB;
  const stretchNeeded = Math.abs(rate - 1);
  const stretchable = stretchNeeded <= maxStretch;
  const incomingRate = stretchable ? Math.round(rate * 1000) / 1000 : 1;
  if (stretchable && stretchNeeded > 0.004)
    notes.push(
      `Tempo matched: ${bpmB.toFixed(1)} → ${bpmA.toFixed(1)} BPM (${((incomingRate - 1) * 100).toFixed(1)} % stretch, pitch preserved).`,
    );
  else if (!stretchable)
    notes.push(
      `Tempo gap of ${(stretchNeeded * 100).toFixed(1)} % is too wide to stretch; the overlap is shortened.`,
    );

  // Overlap is a whole number of bars at the outgoing tempo, chosen so the blend
  // lasts about TARGET_SECONDS: slow songs get more bars, fast songs fewer.
  let bars =
    options.bars === undefined
      ? automaticBars(bpmA)
      : clamp(Math.round(options.bars), MIN_BARS, MAX_BARS);
  const audibleTail = Math.max(0, outgoing.trimmed.end - outgoing.trimmed.start);
  const maxByTail = Math.floor(audibleTail / barsToSeconds(1, bpmA));
  bars = Math.min(bars, Math.max(0, maxByTail));
  if (!stretchable) bars = Math.min(bars, 4);
  if (bars < 2)
    return fallback('The outgoing song has too little audible tail left for a bar-aligned mix.');

  let seconds = barsToSeconds(bars, bpmA);
  if (seconds < minSeconds) return fallback('The overlap would be too short to sound intentional.');

  // Start the overlap on a beat, inside the audible tail.
  const startAt = alignOutgoing(outgoing, outgoing.trimmed.end - seconds);
  if (startAt + seconds > outgoing.trimmed.end + 0.05)
    return fallback('The overlap would run past the end of the song.');

  // Incoming entry: after its intro, on a bar, and clear of any vocal if possible.
  let cue = alignIncoming(incoming);
  let phaseAligned = true;
  if (overlapsRegion(incoming.vocals, cue, cue + seconds, vocalTolerance)) {
    const clear = findClearEntry(incoming, cue, seconds);
    if (clear !== null) {
      cue = clear;
      notes.push('Incoming entry moved to a bar without a prominent vocal.');
    } else {
      // Both sides have vocals: shorten the overlap so the collision is brief.
      bars = Math.max(2, Math.floor(bars / 2));
      seconds = barsToSeconds(bars, bpmA);
      notes.push('Both songs have vocals here: the overlap is halved.');
    }
  }
  if (overlapsRegion(outgoing.vocals, startAt, startAt + seconds, vocalTolerance))
    notes.push(
      'The outgoing song still has a vocal in the overlap; it is faded faster on the low band.',
    );

  // Never fade more than half of the incoming song, even if the cue is late.
  if (cue + seconds > incoming.trimmed.end) {
    const available = incoming.trimmed.end - cue;
    if (available < minSeconds)
      return fallback('The incoming song has no room left after its intro.');
    seconds = available;
    phaseAligned = false;
  }

  return {
    mode: 'beatmatched',
    seconds: Math.round(seconds * 100) / 100,
    startAt: Math.round(startAt * 1000) / 1000,
    cue: Math.round(cue * 1000) / 1000,
    incomingRate,
    stretched: stretchable && stretchNeeded > 0.004,
    bassSwapAt: 0.5,
    bars,
    phaseAligned,
    notes,
  };
}

/**
 * How much each deck should be pulled down so the two arrive at the same level.
 *
 * A mix is judged by its join, and two records mastered years apart rarely meet
 * at the same loudness: the new one at -6 dB sounds like the old one fading out,
 * however well the beats line up. The quieter song is the reference; only the
 * louder deck is turned down, never up, so nothing is pushed towards clipping.
 * This is a playback gain for the length of the overlap — the file, its samples
 * and its loudness on disk are untouched, and the deck is back at unity when the
 * handover ends.
 */
export function levelTrim(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
): { outgoing: number; incoming: number } {
  const meanBody = (analysis: TrackAnalysis | undefined) => {
    if (!analysis) return undefined;
    const levels = analysis.segments
      .filter((segment) => segment.kind === 'body' && segment.level > 0.01)
      .map((segment) => segment.level);
    if (!levels.length) return undefined;
    return levels.reduce((total, level) => total + level, 0) / levels.length;
  };
  const a = meanBody(outgoing),
    b = meanBody(incoming);
  if (!a || !b) return { outgoing: 1, incoming: 1 };
  const decibels = Math.max(-6, Math.min(6, 20 * Math.log10(b / a)));
  if (!Number.isFinite(decibels) || Math.abs(decibels) < 0.5) return { outgoing: 1, incoming: 1 };
  return decibels > 0
    ? { outgoing: 1, incoming: Math.round(10 ** (-decibels / 20) * 1000) / 1000 }
    : { outgoing: Math.round(10 ** (decibels / 20) * 1000) / 1000, incoming: 1 };
}

/**
 * Plans are a pure function of the two analyses and the options, and the engine
 * asks for one twenty times a second while a song plays. Memoising them keeps
 * that loop off the audio thread's budget on a slow phone.
 */
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
  ].join('|');
  const hit = plans.get(key);
  if (hit) return hit;
  const plan = planTransition(outgoing, incoming, options);
  plans.set(key, plan);
  return plan;
}

/** True when the plan can be executed by the current engine. */
export function isUsablePlan(plan: TransitionPlan, remaining: number): boolean {
  return plan.mode !== 'cut' && plan.seconds >= 0.5 && remaining > 0.25;
}

/**
 * Bass-swap curve: the outgoing low band closes as the incoming one opens, with a
 * short cross point so the kick never disappears completely.
 */
export function bassSwapGains(progress: number): { outgoing: number; incoming: number } {
  const p = clamp(progress, 0, 1);
  // Cosine ramp centred slightly before the middle, which is what keeps the
  // low end continuous instead of leaving a gap.
  const centre = 0.45;
  const width = 0.35;
  const t = clamp((p - (centre - width / 2)) / width, 0, 1);
  const smooth = t * t * (3 - 2 * t);
  return { outgoing: Math.cos((smooth * Math.PI) / 2), incoming: Math.sin((smooth * Math.PI) / 2) };
}

const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Equal-power gains for a plain crossfade: A leaves exactly as fast as B arrives. */
export function planGains(progress: number): { outgoing: number; incoming: number } {
  const p = clamp(progress, 0, 1);
  return { outgoing: Math.cos((p * Math.PI) / 2), incoming: Math.sin((p * Math.PI) / 2) };
}

/**
 * Equal-power gains for a mix, which is not a crossfade.
 *
 * A crossfade slides one song out while the other slides in at the same rate, so
 * both are half-heard for the whole overlap. A mix is staged: the new song comes
 * in quickly and sits at level (that is the moment you hear it arrive), the two
 * play together for a few bars, and then the old song gets out of the way. The
 * power sum stays at one the whole way, so nothing clips and no band drops out —
 * only the balance changes, and it changes in a shape you can hear as a decision
 * rather than a slide.
 */
export function handoverGains(progress: number): { outgoing: number; incoming: number } {
  const p = clamp(progress, 0, 1);
  // Fast arrival, a held middle, then the outgoing song leaves on the phrase.
  const phase =
    p < 0.28
      ? 0.5 * smoothstep(p / 0.28)
      : p < 0.62
        ? 0.5 + 0.06 * smoothstep((p - 0.28) / 0.34)
        : 0.56 + 0.44 * smoothstep((p - 0.62) / 0.38);
  return { outgoing: Math.cos((phase * Math.PI) / 2), incoming: Math.sin((phase * Math.PI) / 2) };
}
