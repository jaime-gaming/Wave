import { type TrackAnalysis } from '../audio/dsp';

const BEATS_PER_BAR = 4;

export const MIN_INSTRUMENTAL_SECONDS = 4;

export const MIN_GRID_CONFIDENCE = 0.35;

export interface InstrumentalEdge {
  start: number;

  end: number;
}

export interface InstrumentalPair {
  outgoing: InstrumentalEdge;

  incoming: InstrumentalEdge;
}

export interface PulseGrid {
  bpm: number;

  offset: number;
}

export interface InstrumentalPulseRequest {
  startAt: number;

  cue: number;

  seconds: number;

  maxCue: number;

  minSeconds: number;

  driftPerSecond: number;

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

function trailingInstrumental(analysis: TrackAnalysis): InstrumentalEdge | undefined {
  if (!analysis.vocals.length) return undefined;
  const lastVoice = Math.max(...analysis.vocals.map((region) => region.end));
  const start = Math.max(analysis.trimmed.start, lastVoice);
  const end = analysis.trimmed.end;
  return end - start >= MIN_INSTRUMENTAL_SECONDS ? { start, end } : undefined;
}

function leadingInstrumental(analysis: TrackAnalysis): InstrumentalEdge | undefined {
  if (!analysis.vocals.length) return undefined;
  const firstVoice = Math.min(...analysis.vocals.map((region) => region.start));
  const start = analysis.trimmed.start;
  const end = Math.min(analysis.trimmed.end, firstVoice);
  return end - start >= MIN_INSTRUMENTAL_SECONDS ? { start, end } : undefined;
}

export function instrumentalEdges(
  outgoing: TrackAnalysis | undefined,
  incoming: TrackAnalysis | undefined,
): InstrumentalPair | undefined {
  if (!outgoing || !incoming) return undefined;
  const tail = trailingInstrumental(outgoing);
  const head = leadingInstrumental(incoming);
  return tail && head ? { outgoing: tail, incoming: head } : undefined;
}

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

export function barPhase(time: number, grid: PulseGrid): number {
  const bar = (BEATS_PER_BAR * 60) / grid.bpm;
  const since = (((time - grid.offset) % bar) + bar) % bar;

  return since >= bar - 1e-6 ? 0 : since;
}

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

export function alignInstrumentalPulse(
  edges: InstrumentalPair,
  outgoingGrid: PulseGrid,
  incomingGrid: PulseGrid,
  request: InstrumentalPulseRequest,
): InstrumentalAlignment | undefined {
  const barA = (BEATS_PER_BAR * 60) / outgoingGrid.bpm;
  const barB = (BEATS_PER_BAR * 60) / incomingGrid.bpm;
  const minSeconds = Math.max(0.5, request.minSeconds);

  const phrase = Math.max(minSeconds, 2 * barA);

  const startFrom = Math.max(edges.outgoing.start, request.startAt - 3 * barA);
  const startTo = Math.min(
    edges.outgoing.end - phrase,
    request.startAt + request.seconds,
    edges.outgoing.end,
  );
  const startAt = nearestDownbeat(outgoingGrid, startFrom, startTo, request.startAt);
  if (startAt === null) return undefined;

  const cueFrom = Math.max(edges.incoming.start, request.cue - 2 * barB);
  const cueTo = Math.min(
    edges.incoming.end - phrase,
    request.maxCue,
    request.cue + 2 * barB,
    edges.incoming.end,
  );
  const cue = nearestDownbeat(incomingGrid, cueFrom, cueTo, request.cue);
  if (cue === null) return undefined;

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
