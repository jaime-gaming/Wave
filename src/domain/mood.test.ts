import { describe, expect, it } from 'vitest';
import type { TrackAnalysis } from '../audio/dsp';
import { makeTrack } from '../test/fixtures';
import { analyzeSongMood, dwellEngagement, inferListeningMood, moodSimilarity } from './mood';

const dsp = (over: Partial<TrackAnalysis> = {}): TrackAnalysis => ({
  duration: 210,
  frameSeconds: 0.02,
  beats: { bpm: 124, offset: 0, confidence: 0.85 },
  trimmed: { start: 0, end: 208 },
  segments: [{ start: 0, end: 208, level: 0.8, kind: 'body' }],
  vocals: [{ start: 15, end: 180, strength: 0.8 }],
  profile: { bass: 0.35, low: 0.25, mid: 0.25, high: 0.15 },
  peak: 0.85,
  ...over,
});

describe('Local song mood engine', () => {
  it('classifies calm ambient/lo-fi tracks distinctly from intense metal/techno', () => {
    const ambient = analyzeSongMood(
      makeTrack({ title: 'Ocean Rain Prelude', genres: ['Ambient', 'Piano'] }),
      dsp({
        beats: { bpm: 68, offset: 0, confidence: 0.5 },
        segments: [{ start: 0, end: 200, level: 0.22, kind: 'body' }],
        vocals: [],
        profile: { bass: 0.15, low: 0.35, mid: 0.35, high: 0.15 },
        peak: 0.35,
      }),
    );
    const metal = analyzeSongMood(
      makeTrack({ title: 'Thunder Fire Storm', genres: ['Heavy Metal'] }),
      dsp({
        beats: { bpm: 168, offset: 0, confidence: 0.9 },
        segments: [{ start: 0, end: 200, level: 0.95, kind: 'body' }],
        profile: { bass: 0.5, low: 0.25, mid: 0.15, high: 0.1 },
        peak: 0.98,
      }),
    );
    expect(['chill', 'focus']).toContain(ambient.primary);
    expect(metal.primary).toBe('intense');
    expect(ambient.vector.energy).toBeLessThan(0.4);
    expect(metal.vector.energy).toBeGreaterThan(0.75);
    expect(moodSimilarity(ambient.vector, metal.vector)).toBeLessThan(0.5);
  });

  it('understands song themes from both English and Spanish lyrics and titles', () => {
    const heartbreak = analyzeSongMood(
      makeTrack({
        title: 'Lluvia y Adios',
        genres: ['Balada'],
        lyrics: {
          raw: 'Llorar solo en la lluvia, corazon roto y tristeza',
          lines: [{ text: 'Llorar solo en la lluvia, corazon roto y tristeza' }],
          offsetMs: 0,
          source: 'local',
        },
      }),
    );
    expect(heartbreak.primary).toBe('melancholic');
    expect(heartbreak.themes).toContain('reflection');
    expect(heartbreak.vector.valence).toBeLessThan(0.4);

    const party = analyzeSongMood(
      makeTrack({
        title: 'Verano de Fiesta',
        genres: ['Pop', 'Dance'],
        lyrics: {
          raw: 'Bailar bajo el sol, ritmo feliz esta fiesta',
          lines: [{ text: 'Bailar bajo el sol, ritmo feliz esta fiesta' }],
          offsetMs: 0,
          source: 'local',
        },
      }),
    );
    expect(party.primary).toBe('upbeat');
    expect(party.themes).toContain('dance');
    expect(party.vector.valence).toBeGreaterThan(0.65);
  });

  it('infers the listener automatic session mood from current and recent tracks', () => {
    const chillA = makeTrack({ id: 'c1', title: 'Quiet Waves', genres: ['Lo-fi'] });
    const chillB = makeTrack({ id: 'c2', title: 'Midnight Piano', genres: ['Ambient'] });
    const rave = makeTrack({ id: 'r1', title: 'Turbo Rave', genres: ['Techno'] });

    const chillSession = inferListeningMood([chillA, chillB, rave], ['c2'], chillA);
    expect(chillSession).toBeDefined();
    expect(['chill', 'focus']).toContain(chillSession!.primary);

    const hypeSession = inferListeningMood([chillA, chillB, rave], ['c2'], rave);
    expect(hypeSession!.vector.energy).toBeGreaterThan(chillSession!.vector.energy + 0.15);
  });

  it('weights real dwell time and repels quickly skipped tracks', () => {
    expect(dwellEngagement(4, 200, false)).toBeLessThan(0);
    expect(dwellEngagement(195, 200, true)).toBeGreaterThan(1.1);

    const chill = makeTrack({
      id: 'c1',
      title: 'Ocean Rain Prelude',
      genres: ['Ambient'],
      duration: 200,
    });
    const rave = makeTrack({ id: 'r1', title: 'Turbo Rave', genres: ['Techno'], duration: 200 });
    const now = Date.now();
    const session = inferListeningMood([chill, rave], [], undefined, undefined, [
      { trackId: 'c1', seconds: 190, duration: 200, completed: true, at: now - 30_000 },
      { trackId: 'r1', seconds: 4, duration: 200, completed: false, at: now - 5_000 },
    ]);
    expect(session).toBeDefined();
    expect(['chill', 'focus']).toContain(session!.primary);
    expect(session!.vector.energy).toBeLessThan(0.45);
  });
});
