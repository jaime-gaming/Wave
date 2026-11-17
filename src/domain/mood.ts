import type { TrackAnalysis } from '../audio/dsp';
import { canonical } from './lyricsMatch';
import type { Track } from './types';

/**
 * Local-only musical mood & song-theme engine.
 *
 * Understands what a song feels like and what it is about using strictly
 * on-device signals:
 *   1. Audio DSP measurements (tempo, spectral balance, dynamic energy, vocal density)
 *   2. Genre taxonomy (English & Spanish styles)
 *   3. Title, album and saved lyrics lexical cues (English & Spanish)
 *
 * Nothing ever leaves the device. The resulting mood vector powers both
 * automatic Home recommendations and mood-aware Autoplay, as well as varied
 * Daily Mix grouping when genre tags are sparse.
 */

export type MoodLabel =
  'chill' | 'focus' | 'energetic' | 'upbeat' | 'melancholic' | 'night' | 'intense';

export interface MoodVector {
  /** 0 = calm/gentle, 1 = high-energy/driving */
  energy: number;
  /** 0 = melancholic/dark/somber, 1 = bright/joyful/uplifting */
  valence: number;
  /** 0 = soft/delicate, 1 = heavy/punchy/percussive */
  intensity: number;
  /** 0 = anthemic/social, 1 = intimate/atmospheric/instrumental */
  intimacy: number;
  /** 0 = slow (~60 BPM), 1 = fast (~175 BPM) */
  tempo: number;
}

export interface SongMood {
  primary: MoodLabel;
  secondary?: MoodLabel;
  vector: MoodVector;
  /** 0..1 strength of evidence behind the profile. */
  confidence: number;
  /** Detected thematic cues (e.g. 'night', 'reflection', 'dance', 'calm'). */
  themes: string[];
}

export interface ListenerMood {
  primary: MoodLabel;
  vector: MoodVector;
  confidence: number;
}

/**
 * Behavioral listening signal for one play or active session.
 * Captures how long the listener stayed with a song rather than treating a
 * 3-second skip the same as a full listen.
 */
export interface ListeningSignal {
  trackId: string;
  /** Actual seconds listened so far (or before switching). */
  seconds: number;
  /** Song duration in seconds when known. */
  duration?: number;
  /** True when the listener reached the end of the track. */
  completed?: boolean;
  /** Epoch ms when the play started. */
  at?: number;
}

/**
 * Converts listening dwell time into a signed engagement weight:
 *  - Quick skip (< 12s and < 20% heard, not completed) -> negative weight (-0.42..-0.12),
 *    gently steering away from that track's mood.
 *  - Exploratory listening (12..25s) -> small tentative positive weight (0.12..0.38).
 *  - Settled listening (>= 25s or >= 35% heard) -> strong positive mood anchor (0.5..1.15).
 *  - Full listen / completion (>= 85% or completed) -> strongest anchor (1.35).
 */
export function dwellEngagement(seconds: number, duration = 0, completed = false): number {
  const heard = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const len = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const ratio = len > 0 ? clamp(heard / len, 0, 1) : 0;

  if (completed || (len > 0 && ratio >= 0.85) || heard >= 180) return 1.35;
  if (heard >= 25 || (len > 0 && ratio >= 0.35 && heard >= 12)) {
    const progress = len > 0 ? ratio : clamp((heard - 25) / 140, 0, 1);
    return 0.55 + progress * 0.65;
  }
  if (heard >= 12 || (len > 0 && ratio >= 0.2)) {
    return 0.12 + ((heard - 12) / 13) * 0.28;
  }
  // Short skip (< 12s): stronger negative cue when the listener left within a few seconds.
  if (heard >= 1.5) {
    return -(0.42 - (heard / 12) * 0.28);
  }
  return 0;
}

/** Subtle local time-of-day prior that fades away as soon as real listening arrives. */
function timeOfDayPrior(now: number): MoodVector {
  const hour = new Date(now).getHours();
  if (hour >= 22 || hour < 5) {
    // Late night: calmer, more atmospheric & intimate.
    return { energy: 0.38, valence: 0.4, intensity: 0.36, intimacy: 0.74, tempo: 0.44 };
  }
  if (hour >= 6 && hour < 11) {
    // Morning: slightly brighter & steadier.
    return { energy: 0.56, valence: 0.64, intensity: 0.46, intimacy: 0.48, tempo: 0.54 };
  }
  if (hour >= 11 && hour < 17) {
    // Midday / afternoon: focused & balanced.
    return { energy: 0.54, valence: 0.56, intensity: 0.48, intimacy: 0.52, tempo: 0.52 };
  }
  // Evening: warm & moderately energetic.
  return { energy: 0.58, valence: 0.54, intensity: 0.52, intimacy: 0.54, tempo: 0.54 };
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

interface MoodPreset {
  energy: number;
  valence: number;
  intensity: number;
  intimacy: number;
  tempo: number;
  theme?: string;
}

const GENRE_PROFILES: [RegExp, MoodPreset][] = [
  [
    /\b(?:ambient|drone|new age|meditation|sleep|soundscape)\b/i,
    { energy: 0.14, valence: 0.48, intensity: 0.1, intimacy: 0.94, tempo: 0.2, theme: 'calm' },
  ],
  [
    /\b(?:lo-?fi|chillhop|chillout|chill|downtempo|trip-?hop|lounge)\b/i,
    { energy: 0.28, valence: 0.52, intensity: 0.22, intimacy: 0.82, tempo: 0.3, theme: 'calm' },
  ],
  [
    /\b(?:classical|piano|baroque|chamber|orchestral|instrumental|soundtrack|score|neoclassical)\b/i,
    {
      energy: 0.3,
      valence: 0.48,
      intensity: 0.25,
      intimacy: 0.86,
      tempo: 0.35,
      theme: 'instrumental',
    },
  ],
  [
    /\b(?:jazz|bossa|swing|smooth jazz|bebop)\b/i,
    { energy: 0.4, valence: 0.62, intensity: 0.3, intimacy: 0.72, tempo: 0.42, theme: 'calm' },
  ],
  [
    /\b(?:acoustic|folk|singer-?songwriter|americana|unplugged|trova)\b/i,
    {
      energy: 0.34,
      valence: 0.46,
      intensity: 0.26,
      intimacy: 0.78,
      tempo: 0.38,
      theme: 'reflection',
    },
  ],
  [
    /\b(?:ballad|balada|bolero|blues|sad|slowcore|shoegaze|dream ?pop|emo|goth)\b/i,
    {
      energy: 0.32,
      valence: 0.24,
      intensity: 0.32,
      intimacy: 0.76,
      tempo: 0.32,
      theme: 'reflection',
    },
  ],
  [
    /\b(?:soul|r&b|rnb|neo-?soul|motown)\b/i,
    { energy: 0.48, valence: 0.54, intensity: 0.4, intimacy: 0.65, tempo: 0.44, theme: 'romance' },
  ],
  [
    /\b(?:synthwave|retrowave|vaporwave|darkwave|cyberpunk|outrun|nightcore)\b/i,
    { energy: 0.68, valence: 0.44, intensity: 0.62, intimacy: 0.62, tempo: 0.66, theme: 'night' },
  ],
  [
    /\b(?:indie|alternative|alt-?rock|britpop|post-?punk|new wave)\b/i,
    { energy: 0.58, valence: 0.48, intensity: 0.54, intimacy: 0.48, tempo: 0.56 },
  ],
  [
    /\b(?:pop|synth-?pop|electropop|k-?pop|j-?pop|dance-?pop|disco|funk|nu-?disco)\b/i,
    { energy: 0.76, valence: 0.8, intensity: 0.62, intimacy: 0.24, tempo: 0.66, theme: 'dance' },
  ],
  [
    /\b(?:reggaeton|latin|salsa|bachata|merengue|cumbia|afrobeat|dancehall|tropical|reggae)\b/i,
    { energy: 0.78, valence: 0.82, intensity: 0.68, intimacy: 0.22, tempo: 0.62, theme: 'dance' },
  ],
  [
    /\b(?:house|deep house|tech house|edm|electronic|electro|trance|progressive|club|eurodance)\b/i,
    { energy: 0.84, valence: 0.68, intensity: 0.78, intimacy: 0.3, tempo: 0.76, theme: 'energy' },
  ],
  [
    /\b(?:techno|dubstep|drum ?& ?bass|dnb|jungle|hardstyle|breakbeat|industrial|rave|hyperpop)\b/i,
    { energy: 0.92, valence: 0.45, intensity: 0.92, intimacy: 0.35, tempo: 0.88, theme: 'energy' },
  ],
  [
    /\b(?:hip-?hop|rap|trap|drill|boom ?bap|urbano|grime)\b/i,
    { energy: 0.7, valence: 0.48, intensity: 0.74, intimacy: 0.36, tempo: 0.54, theme: 'energy' },
  ],
  [
    /\b(?:rock|classic rock|hard rock|garage|grunge|skate)\b/i,
    { energy: 0.76, valence: 0.52, intensity: 0.78, intimacy: 0.28, tempo: 0.66, theme: 'energy' },
  ],
  [
    /\b(?:metal|heavy metal|death metal|thrash|metalcore|punk|hardcore|screamo|nu-?metal)\b/i,
    { energy: 0.94, valence: 0.28, intensity: 0.96, intimacy: 0.22, tempo: 0.84, theme: 'intense' },
  ],
];

interface LexicalCue {
  theme: string;
  pattern: RegExp;
  delta: Partial<MoodVector>;
}

const LEXICAL_CUES: LexicalCue[] = [
  {
    theme: 'night',
    pattern:
      /\b(?:night|midnight|moon|moonlight|stars|neon|shadow|shadows|dark|darkness|3am|2am|afterhours|nocturne|noche|medianoche|luna|estrellas|sombra|sombras|oscuro|madrugada)\b/i,
    delta: { energy: -0.06, valence: -0.1, intimacy: 0.24 },
  },
  {
    theme: 'reflection',
    pattern:
      /\b(?:sad|tears|cry|crying|alone|lonely|broken|heartbreak|goodbye|miss you|sorry|pain|hurt|hollow|fading|ghost|rain|grey|triste|lagrimas|llorar|solo|sola|soledad|roto|rota|adios|dolor|lluvia|nostalgia|olvido|ausencia)\b/i,
    delta: { energy: -0.14, valence: -0.28, intensity: -0.1, intimacy: 0.2 },
  },
  {
    theme: 'calm',
    pattern:
      /\b(?:calm|quiet|sleep|dream|dreaming|soft|breeze|ocean|waves|sea|sunset|sunrise|peace|gentle|slow|float|lullaby|calma|sueno|suenos|brisa|mar|olas|paz|suave|lento|atardecer|silencio)\b/i,
    delta: { energy: -0.22, valence: 0.08, intensity: -0.22, intimacy: 0.24, tempo: -0.14 },
  },
  {
    theme: 'dance',
    pattern:
      /\b(?:dance|dancing|party|groove|disco|club|summer|sunshine|happy|smile|celebrate|weekend|fiesta|bailar|baile|ritmo|verano|sol|feliz|alegria|sonreir|sabado)\b/i,
    delta: { energy: 0.2, valence: 0.26, intensity: 0.12, intimacy: -0.2, tempo: 0.14 },
  },
  {
    theme: 'romance',
    pattern:
      /\b(?:love|heart|kiss|hold me|baby|darling|forever|sweet|amor|corazon|beso|besos|querer|contigo|siempre|carino|pasion)\b/i,
    delta: { valence: 0.12, intimacy: 0.14 },
  },
  {
    theme: 'energy',
    pattern:
      /\b(?:fire|run|running|fast|wild|power|electric|thunder|storm|fight|rise|unstoppable|rush|velocity|turbo|fuego|correr|fuerza|poder|tormenta|rayo|lucha|velocidad)\b/i,
    delta: { energy: 0.24, intensity: 0.24, intimacy: -0.16, tempo: 0.16 },
  },
  {
    theme: 'instrumental',
    pattern:
      /\b(?:instrumental|acoustic|piano|prelude|etude|sonata|interlude|overture|reprise|ambient|study|focus|acustico|acustica|estudio|concierto)\b/i,
    delta: { energy: -0.14, intensity: -0.16, intimacy: 0.28 },
  },
];

const MOOD_CENTROIDS: Record<MoodLabel, MoodVector> = {
  chill: { energy: 0.26, valence: 0.56, intensity: 0.22, intimacy: 0.78, tempo: 0.32 },
  focus: { energy: 0.28, valence: 0.5, intensity: 0.2, intimacy: 0.9, tempo: 0.38 },
  melancholic: { energy: 0.3, valence: 0.2, intensity: 0.3, intimacy: 0.74, tempo: 0.34 },
  night: { energy: 0.54, valence: 0.36, intensity: 0.5, intimacy: 0.72, tempo: 0.55 },
  upbeat: { energy: 0.74, valence: 0.84, intensity: 0.6, intimacy: 0.24, tempo: 0.66 },
  energetic: { energy: 0.84, valence: 0.62, intensity: 0.78, intimacy: 0.26, tempo: 0.76 },
  intense: { energy: 0.92, valence: 0.26, intensity: 0.94, intimacy: 0.24, tempo: 0.82 },
};

const MOOD_LABELS: MoodLabel[] = [
  'chill',
  'focus',
  'melancholic',
  'night',
  'upbeat',
  'energetic',
  'intense',
];

function extractLyricsSample(track: Track): string {
  const lyrics = track.lyrics;
  if (!lyrics) return '';
  if (lyrics.lines?.length)
    return lyrics.lines
      .slice(0, 60)
      .map((line) => line.text)
      .join(' ')
      .slice(0, 2400);
  if (lyrics.raw) return lyrics.raw.slice(0, 2400);
  return '';
}

function moodDistance(a: MoodVector, b: MoodVector): number {
  const de = (a.energy - b.energy) * 1.25;
  const dv = (a.valence - b.valence) * 1.15;
  const di = (a.intensity - b.intensity) * 1.0;
  const dn = (a.intimacy - b.intimacy) * 0.95;
  const dt = (a.tempo - b.tempo) * 0.85;
  return Math.sqrt(de * de + dv * dv + di * di + dn * dn + dt * dt);
}

/** 0..1 similarity between two mood vectors (1 = identical vibe). */
export function moodSimilarity(a: MoodVector, b: MoodVector): number {
  // Maximum possible weighted Euclidean distance is sqrt(1.25^2 + 1.15^2 + 1 + 0.95^2 + 0.85^2) ≈ 2.347
  const maxDist = 2.347;
  return clamp(1 - moodDistance(a, b) / maxDist, 0, 1);
}

function classifyVector(vector: MoodVector): { primary: MoodLabel; secondary?: MoodLabel } {
  const ranked = MOOD_LABELS.map((label) => ({
    label,
    distance: moodDistance(vector, MOOD_CENTROIDS[label]),
  })).sort((a, b) => a.distance - b.distance);
  const primary = ranked[0].label;
  const second = ranked[1];
  return {
    primary,
    ...(second && second.distance - ranked[0].distance < 0.28 ? { secondary: second.label } : {}),
  };
}

/**
 * Computes a deterministic, 100% local mood & theme profile for a single track.
 * Combines audio DSP features (when available), genres, and title/album/lyrics semantics.
 */
export function analyzeSongMood(track: Track, analysis?: TrackAnalysis): SongMood {
  let energySum = 0.5 * 0.35;
  let valenceSum = 0.5 * 0.35;
  let intensitySum = 0.5 * 0.35;
  let intimacySum = 0.5 * 0.35;
  let tempoSum = 0.5 * 0.35;
  let totalWeight = 0.35;
  let evidence = 0;
  const themes = new Set<string>();

  const blend = (partial: Partial<MoodVector>, weight: number) => {
    if (weight <= 0) return;
    energySum += (partial.energy ?? 0.5) * weight;
    valenceSum += (partial.valence ?? 0.5) * weight;
    intensitySum += (partial.intensity ?? 0.5) * weight;
    intimacySum += (partial.intimacy ?? 0.5) * weight;
    tempoSum += (partial.tempo ?? 0.5) * weight;
    totalWeight += weight;
    evidence += weight;
  };

  // 1. Genre signals (strong prior for musical context).
  if (track.genres?.length) {
    let matched = 0;
    for (const rawGenre of track.genres) {
      const genre = canonical(rawGenre);
      if (!genre) continue;
      for (const [pattern, preset] of GENRE_PROFILES) {
        if (pattern.test(genre)) {
          blend(preset, 1.35);
          if (preset.theme) themes.add(preset.theme);
          matched++;
          break;
        }
      }
    }
    if (matched > 0) evidence += 0.2;
  }

  // 2. Audio DSP signals (objective sonic fingerprint).
  if (analysis) {
    const hasBpm = analysis.beats.confidence >= 0.3 && analysis.beats.bpm >= 50;
    const tempoNorm = hasBpm ? clamp((analysis.beats.bpm - 60) / 115) : 0.5;

    const bodies = analysis.segments.filter((s) => s.kind === 'body' || s.kind === 'build');
    const meanBody = bodies.length
      ? bodies.reduce((s, seg) => s + seg.level, 0) / bodies.length
      : 0.5;
    const peakNorm = clamp(analysis.peak * 1.45);
    const bass = analysis.profile.bass;
    const highs = analysis.profile.mid + analysis.profile.high;
    const audible = Math.max(1, analysis.trimmed.end - analysis.trimmed.start);
    const vocalSeconds = analysis.vocals.reduce((s, v) => s + Math.max(0, v.end - v.start), 0);
    const vocalDensity = clamp(vocalSeconds / audible);

    const dspEnergy = clamp(meanBody * 0.45 + peakNorm * 0.3 + tempoNorm * 0.25);
    const dspIntensity = clamp(bass * 0.95 + peakNorm * 0.4 + (hasBpm ? tempoNorm * 0.25 : 0.1));
    const dspValence = clamp(
      0.32 + highs * 0.65 + (tempoNorm - 0.5) * 0.22 - Math.max(0, bass - 0.5) * 0.2,
    );
    const dspIntimacy = clamp(1 - dspEnergy * 0.55 - vocalDensity * 0.35);

    if (vocalDensity < 0.12 && audible > 30) themes.add('instrumental');
    if (dspEnergy > 0.72 && bass > 0.35) themes.add('energy');
    if (dspEnergy < 0.35 && tempoNorm < 0.4) themes.add('calm');

    blend(
      {
        energy: dspEnergy,
        valence: dspValence,
        intensity: dspIntensity,
        intimacy: dspIntimacy,
        tempo: tempoNorm,
      },
      1.8,
    );
  }

  // 3. Semantic cues from title, album and saved lyrics (what the song is about).
  const metaText = `${track.title ?? ''} ${track.album ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
  const lyricsText = extractLyricsSample(track)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');

  const delta: MoodVector = { energy: 0, valence: 0, intensity: 0, intimacy: 0, tempo: 0 };
  let lexicalHits = 0;

  for (const cue of LEXICAL_CUES) {
    const metaHit = cue.pattern.test(metaText);
    const lyricMatches = lyricsText
      ? (lyricsText.match(new RegExp(cue.pattern.source, 'gi'))?.length ?? 0)
      : 0;
    if (!metaHit && lyricMatches === 0) continue;
    themes.add(cue.theme);
    const strength = Math.min(1.6, (metaHit ? 0.85 : 0) + Math.min(0.85, lyricMatches * 0.22));
    delta.energy += (cue.delta.energy ?? 0) * strength;
    delta.valence += (cue.delta.valence ?? 0) * strength;
    delta.intensity += (cue.delta.intensity ?? 0) * strength;
    delta.intimacy += (cue.delta.intimacy ?? 0) * strength;
    delta.tempo += (cue.delta.tempo ?? 0) * strength;
    lexicalHits++;
  }

  // 4. Subtle duration contour (long atmospheric journeys vs short punchy cuts).
  if (track.duration > 390) {
    delta.intimacy += 0.06;
    delta.energy -= 0.04;
  } else if (track.duration > 0 && track.duration < 150) {
    delta.energy += 0.04;
  }

  const vector: MoodVector = {
    energy: clamp(energySum / totalWeight + clamp(delta.energy, -0.35, 0.35)),
    valence: clamp(valenceSum / totalWeight + clamp(delta.valence, -0.35, 0.35)),
    intensity: clamp(intensitySum / totalWeight + clamp(delta.intensity, -0.35, 0.35)),
    intimacy: clamp(intimacySum / totalWeight + clamp(delta.intimacy, -0.35, 0.35)),
    tempo: clamp(tempoSum / totalWeight + clamp(delta.tempo, -0.25, 0.25)),
  };

  const { primary, secondary } = classifyVector(vector);
  const confidence = clamp((evidence + lexicalHits * 0.45) / 3.2, 0.1, 1);

  return {
    primary,
    ...(secondary ? { secondary } : {}),
    vector,
    confidence: Math.round(confidence * 100) / 100,
    themes: [...themes],
  };
}

/**
 * Infers the listener's current automatic listening mood from actual listening
 * dwell time, completions, quick skips and recent playback sequence.
 *
 * - Listening to a song for 25+ seconds (or completing it) strongly anchors the
 *   current mood.
 * - Quickly skipping a song (< 12s) softly steers the mood vector away from it.
 * - Repeated listens to a similar vibe raise confidence steadily.
 * - A gentle local time-of-day prior fills in only when listening evidence is thin.
 */
export function inferListeningMood(
  tracks: Track[],
  recentIds: string[],
  current?: Track,
  analysisLookup?: (track: Track) => TrackAnalysis | undefined,
  signals?: ListeningSignal[],
  now = Date.now(),
): ListenerMood | undefined {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const positiveItems: { track: Track; weight: number }[] = [];
  const negativeItems: { track: Track; weight: number }[] = [];

  if (signals && signals.length > 0) {
    // Most recent signals first; decay across the latest 12 behavioral samples
    // and also by wall-clock age so a session from yesterday fades gently.
    const recentSignals = signals.slice(-12).reverse();
    const recencyWeights = [2.1, 1.55, 1.2, 0.94, 0.74, 0.58, 0.46, 0.36, 0.28, 0.22, 0.17, 0.13];
    const playCounts = new Map<string, number>();

    for (let i = 0; i < recentSignals.length; i++) {
      const sig = recentSignals[i];
      const track = byId.get(sig.trackId) ?? (current?.id === sig.trackId ? current : undefined);
      if (!track) continue;
      const engagement = dwellEngagement(
        sig.seconds,
        sig.duration ?? track.duration,
        sig.completed,
      );
      if (Math.abs(engagement) < 0.01) continue;
      const ageHours = sig.at ? Math.max(0, (now - sig.at) / 3_600_000) : 0;
      const ageDecay = ageHours > 0 ? Math.exp(-ageHours / 18) : 1;
      const base = (recencyWeights[i] ?? 0.1) * (0.25 + 0.75 * ageDecay);

      if (engagement > 0) {
        const seen = playCounts.get(track.id) ?? 0;
        playCounts.set(track.id, seen + 1);
        // Repeated full listens of the same track reinforce mood without dominating blindly.
        const repeatFactor = seen === 0 ? 1 : 0.48;
        positiveItems.push({ track, weight: base * engagement * repeatFactor });
      } else {
        negativeItems.push({ track, weight: base * Math.abs(engagement) });
      }
    }
  }

  // Fallback / supplement from current track & recent IDs when dwell signals are sparse.
  if (positiveItems.length === 0) {
    const seen = new Set<string>();
    if (current) {
      positiveItems.push({ track: current, weight: 1.8 });
      seen.add(current.id);
    }
    const weights = [1.4, 1.0, 0.72, 0.52, 0.38, 0.26];
    let idx = 0;
    for (let i = recentIds.length - 1; i >= 0 && idx < weights.length; i--) {
      const id = recentIds[i];
      if (seen.has(id)) continue;
      const track = byId.get(id);
      if (!track) continue;
      seen.add(id);
      positiveItems.push({ track, weight: weights[idx++] });
    }
  } else if (current && !signals?.some((s) => s.trackId === current.id)) {
    // Track just started and hasn't accumulated dwell yet: give it a modest nudge
    // so the mood transitions smoothly once the listener stays with it.
    positiveItems.push({ track: current, weight: 0.45 });
  }

  if (!positiveItems.length && !negativeItems.length) return undefined;

  // Blend in a soft time-of-day prior (weight 0.28) that recedes as evidence grows.
  const prior = timeOfDayPrior(now);
  const priorWeight = 0.28;
  let energy = prior.energy * priorWeight;
  let valence = prior.valence * priorWeight;
  let intensity = prior.intensity * priorWeight;
  let intimacy = prior.intimacy * priorWeight;
  let tempo = prior.tempo * priorWeight;
  let weightTotal = priorWeight;
  let confSum = 0;
  let evidenceWeight = 0;

  for (const item of positiveItems) {
    const mood = analyzeSongMood(item.track, analysisLookup?.(item.track));
    const effective = item.weight * (0.45 + 0.55 * mood.confidence);
    energy += mood.vector.energy * effective;
    valence += mood.vector.valence * effective;
    intensity += mood.vector.intensity * effective;
    intimacy += mood.vector.intimacy * effective;
    tempo += mood.vector.tempo * effective;
    weightTotal += effective;
    confSum += mood.confidence * item.weight;
    evidenceWeight += item.weight;
  }

  if (weightTotal <= 0) return undefined;

  let vecEnergy = energy / weightTotal;
  let vecValence = valence / weightTotal;
  let vecIntensity = intensity / weightTotal;
  let vecIntimacy = intimacy / weightTotal;
  let vecTempo = tempo / weightTotal;

  // Apply gentle repulsion from quick-skipped tracks so skipped styles recede.
  for (const item of negativeItems) {
    const skippedMood = analyzeSongMood(item.track, analysisLookup?.(item.track));
    const push = Math.min(0.22, item.weight * 0.24 * (0.4 + 0.6 * skippedMood.confidence));
    vecEnergy += (vecEnergy - skippedMood.vector.energy) * push;
    vecValence += (vecValence - skippedMood.vector.valence) * push;
    vecIntensity += (vecIntensity - skippedMood.vector.intensity) * push;
    vecIntimacy += (vecIntimacy - skippedMood.vector.intimacy) * push;
    vecTempo += (vecTempo - skippedMood.vector.tempo) * push;
  }

  const vector: MoodVector = {
    energy: clamp(vecEnergy),
    valence: clamp(vecValence),
    intensity: clamp(vecIntensity),
    intimacy: clamp(vecIntimacy),
    tempo: clamp(vecTempo),
  };
  const { primary } = classifyVector(vector);
  const avgConfidence = evidenceWeight > 0 ? confSum / evidenceWeight : 0.25;
  const volumeBoost = clamp(evidenceWeight / 2.2, 0.35, 1);
  return {
    primary,
    vector,
    confidence: Math.round(clamp(avgConfidence * volumeBoost, 0.1, 1) * 100) / 100,
  };
}

/** Human-readable label for a mood category (used cleanly in Daily Mixes / descriptors). */
export const MOOD_DISPLAY: Record<MoodLabel, string> = {
  chill: 'Chill',
  focus: 'Focus',
  melancholic: 'Melancholic',
  night: 'Late Night',
  upbeat: 'Upbeat',
  energetic: 'Energetic',
  intense: 'Intense',
};
