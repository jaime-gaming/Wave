import { type TrackAnalysis } from '../audio/dsp';

/**
 * Instrumental-edge pulse alignment (Wave 3.0).
 *
 * Some records end on an instrumental outro and the next one opens on an
 * instrumental intro. Both stretches have a pulse of their own, and when the
 * handover starts in the middle of a bar on one side and on a downbeat on the
 * other, the join sounds like two records trading kicks instead of one phrase
 * handing over to the next.
 *
 * This module finds those two stretches from the vocal regions Mix already
 * measures (the same reversible heuristic the planner uses), and puts the start
 * of the blend on a downbeat of *both* beat grids. Nothing is sped up, slowed
 * down, time-stretched or written to disk: the two records keep the tempo they
 * were recorded at, and only the cue positions and the number of shared bars
 * change. When the tempos differ, the overlap is bounded so the pulses cannot
 * drift more than the planner already allows.
 *
 * It deliberately does nothing when either side has no real instrumental edge:
 * a song that opens with a sung line, or one whose last word runs into the final
 * fade, keeps the plan it had before.
 */

/** Four beats to the bar, as in the planner. Kept local to avoid a cycle. */
const BEATS_PER_BAR = 4;
/** Below this, an "instrumental outro/intro" is a gap between phrases, not a section. */
export const MIN_INSTRUMENTAL_SECONDS = 4;
/** The same confidence the planner requires before trusting a beat grid. */
export const MIN_GRID_CONFIDENCE = 0.35;

export interface InstrumentalEdge {
  /** First second of the instrumental stretch. */
  start: number;
  /** Last second of the instrumental stretch (the audible end). */
  end: number;
}

export interface InstrumentalPair {
  /** Instrumental outro of the song that is leaving. */
  outgoing: InstrumentalEdge;
  /** Instrumental intro of the song that is arriving. */
  incoming: InstrumentalEdge;
}

export interface PulseGrid {
  bpm: number;
  /** Position of beat one, in seconds. */
  offset: number;
}

export interface InstrumentalPulseRequest {
  /** Where the planner wanted the overlap to start. */
  startAt: number;
  /** Where the planner wanted the incoming song cued. */
  cue: number;
  /** How long the planner wanted the two songs to overlap. */
  seconds: number;
  /** Furthest the incoming cue may move (the planner's intro bound). */
  maxCue: number;
  /** Shortest overlap that still reads as a mix. */
  minSeconds: number;
  /** Relative drift per second between the two tempos; 0 for half/double time. */
  driftPerSecond: number;
  /** Beats of drift allowed inside one blend. */
  driftBeats: number;
}

export interface InstrumentalAlignment {
  startAt: number;
  cue: number;
  seconds: number;
  bars: number;
  notes: string[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The last vocal region marks the start of an instrumental outro. */
function trailingInstrumental(analysis: TrackAnalysis): InstrumentalEdge | undefined {
  if (!analysis.vocals.length) return undefined;
  const lastVoice = Math.max(...analysis.vocals.map((region) => region.end));
  const start = Math.max(analysis.trimmed.start, lastVoice);
  const end = analysis.trimmed.end;
  return end - start >= MIN_INSTRUMENTAL_SECONDS ? { start, end } : undefined;
}

/** The first vocal region marks the end of an instrumental intro. */
function leadingInstrumental(analysis: TrackAnalysis): InstrumentalEdge | undefined {
  if (!analysis.vocals.length) return undefined;
  const firstVoice = Math.min(...analysis.vocals.map((region) => region.start));
  const start = analysis.trimmed.start;
  const end = Math.min(analysis.trimmed.end, firstVoice);
  return end - start >= MIN_INSTRUMENTAL_SECONDS ? { start, end } : undefined;
}

/**
 * Both instrumental edges, or `undefined` when this pair is not the case the
 * alignment is for. Requiring a vocal region on each side is what keeps the
 * change narrowly scoped: an entirely instrumental record has no edges to find
 * and keeps its ordinary bar-aligned plan.
 */
export function instrumentalEdges(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
): InstrumentalPair | undefined {
  if (!outgoing || !incoming) return undefined;
  const tail = trailingInstrumental(outgoing);
  const head = leadingInstrumental(incoming);
  return tail && head ? { outgoing: tail, incoming: head } : undefined;
}

/** The grid of a record, when steady enough to place a downbeat on. */
export function pulseGrid(analysis: TrackAnalysis): PulseGrid | undefined {
  const { bpm, offset, confidence } = analysis.beats;
  if (
    !Number.isFinite(bpm) ||
    bpm < 60 ||
    bpm > 200 ||
    !Number.isFinite(offset) ||
    confidence < MIN_GRID_CONFIDENCE
  )
    return undefined;
  return { bpm, offset };
}

/** Seconds since the last downbeat, in [0, barLength). */
export function barPhase(time: number, grid: PulseGrid): number {
  const bar = (BEATS_PER_BAR * 60) / grid.bpm;
  const since = (((time - grid.offset) % bar) + bar) % bar;
  // A downbeat computed as `offset + n * bar` can land a floating-point hair
  // before the bar line; that is the same downbeat, not a whole bar of drift.
  return since >= bar - 1e-6 ? 0 : since;
}

/** Downbeats inside [from, to], earliest first. Bounded so a bad grid cannot spin. */
export function downbeats(grid: PulseGrid, from: number, to: number): number[] {
  if (to < from) return [];
  const bar = (BEATS_PER_BAR * 60) / grid.bpm;
  const first = Math.ceil((from - grid.offset) / bar - 1e-9);
  const times: number[] = [];
  for (let index = first; times.length < 128; index++) {
    const time = grid.offset + index * bar;
    if (time > to + 1e-9) break;
    if (time >= from - 1e-9) times.push(round3(time));
  }
  return times;
}

/** The downbeat nearest `desired`, preferring an earlier one on a tie. */
function nearestDownbeat(
  grid: PulseGrid,
  from: number,
  to: number,
  desired: number,
): number | null {
  const candidates = downbeats(grid, from, to);
  if (!candidates.length) return null;
  return candidates.reduce((best, time) => {
    const distance = Math.abs(time - desired);
    const bestDistance = Math.abs(best - desired);
    return distance < bestDistance - 1e-9 || (distance <= bestDistance + 1e-9 && time < best)
      ? time
      : best;
  });
}

/**
 * Places the handover on a downbeat of both instrumental stretches.
 *
 * Both cues move by whole bars only, inside their own instrumental edge and
 * close to where the planner wanted them. The overlap stays a whole number of
 * bars at the outgoing tempo — the audio engine and `realignPlan` depend on that
 * — and is shortened when the two tempos would otherwise drift apart inside it.
 *
 * Returns `undefined` when no honest alignment fits, so the caller keeps the
 * plan it already had instead of being handed a guess.
 */
export function alignInstrumentalPulse(
  edges: InstrumentalPair,
  outgoingGrid: PulseGrid,
  incomingGrid: PulseGrid,
  request: InstrumentalPulseRequest,
): InstrumentalAlignment | undefined {
  const barA = (BEATS_PER_BAR * 60) / outgoingGrid.bpm;
  const barB = (BEATS_PER_BAR * 60) / incomingGrid.bpm;
  const minSeconds = Math.max(0.5, request.minSeconds);
  // Two whole bars is the shortest overlap that still reads as a mix; leaving
  // room for it is part of choosing a downbeat, not an afterthought.
  const phrase = Math.max(minSeconds, 2 * barA);

  // The start may move back far enough to reach the instrumental outro, but
  // never before it and never so late that there is no room for a phrase.
  const startFrom = Math.max(edges.outgoing.start, request.startAt - 3 * barA);
  const startTo = Math.min(
    edges.outgoing.end - phrase,
    request.startAt + request.seconds,
    edges.outgoing.end,
  );
  const startAt = nearestDownbeat(outgoingGrid, startFrom, startTo, request.startAt);
  if (startAt === null) return undefined;

  // The incoming cue stays inside its instrumental intro, inside the planner's
  // intro bound, and within two bars of the entry it had chosen.
  const cueFrom = Math.max(edges.incoming.start, request.cue - 2 * barB);
  const cueTo = Math.min(
    edges.incoming.end - phrase,
    request.maxCue,
    request.cue + 2 * barB,
    edges.incoming.end,
  );
  const cue = nearestDownbeat(incomingGrid, cueFrom, cueTo, request.cue);
  if (cue === null) return undefined;

  // Both records keep their own tempo. A real tempo gap makes the downbeats
  // separate as the blend goes on, so the instrumental overlap is capped by the
  // same drift rule as an ordinary beatmatched mix. Half/double time never drifts.
  const driftLimit =
    request.driftPerSecond > 0 && request.driftBeats > 0
      ? (request.driftBeats * 60) / outgoingGrid.bpm / request.driftPerSecond
      : Number.POSITIVE_INFINITY;
  const available = Math.min(
    request.seconds,
    edges.outgoing.end - startAt,
    edges.incoming.end - cue,
    driftLimit,
  );
  const bars = Math.floor(available / barA + 1e-9);
  if (bars < 2 || bars * barA < minSeconds) return undefined;
  const seconds = bars * barA;

  const notes = [
    'Instrumental outro and intro meet on the same downbeat: their pulses line up at the join.',
  ];
  if (seconds < request.seconds - 0.05)
    notes.push(
      request.driftPerSecond > 0 && driftLimit <= available + barA
        ? 'The instrumental overlap is kept short so the two pulses cannot drift apart.'
        : 'The instrumental overlap fits inside both instrumental sections.',
    );
  else if (request.driftPerSecond === 0)
    notes.push('Both instrumentals keep the same pulse for the whole handover.');
  return {
    startAt: round3(startAt),
    cue: round3(cue),
    seconds: round2(seconds),
    bars,
    notes,
  };
}

/** True when both cues really sit on a downbeat of their own grid. */
export function pulsesMeet(
  alignment: InstrumentalAlignment,
  outgoingGrid: PulseGrid,
  incomingGrid: PulseGrid,
): boolean {
  return (
    Math.max(barPhase(alignment.startAt, outgoingGrid), barPhase(alignment.cue, incomingGrid)) <
    1e-3
  );
}
