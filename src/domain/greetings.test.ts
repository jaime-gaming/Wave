import { describe, expect, it } from 'vitest';
import { GREETINGS, greetingFor, greetingGroup } from './greetings';
import type { ListenerMood } from './mood';
import spanish from '../../i18n/es.json';

const at = (hour: number) => new Date(2026, 10, 19, hour).getTime();
const mood = (primary: ListenerMood['primary'], confidence = 0.9): ListenerMood => ({
  primary,
  confidence,
  vector: { energy: 0.5, valence: 0.5, intensity: 0.5, intimacy: 0.5, tempo: 0.5 },
});

describe('adaptive greetings', () => {
  it('provides distinct, personalizable and stable choices', () => {
    const all = Object.values(GREETINGS).flat();
    expect(all.length).toBe(24);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((text) => text.includes('{name}'))).toBe(true);
    expect(all.every((text) => (spanish as Record<string, string>)[text]?.includes('{name}'))).toBe(
      true,
    );
    expect(greetingFor('morning', 0.5)).toBe(greetingFor('morning', 0.5));
    expect(greetingFor('general', Number.NaN)).toBe(GREETINGS.general[0]);
    expect(greetingFor('general', 2)).toBe(GREETINGS.general[2]);
  });
  it('follows local time when no reliable listening context exists', () => {
    expect(greetingGroup({ now: at(8), signals: [], playing: false })).toBe('morning');
    expect(greetingGroup({ now: at(14), signals: [], playing: false })).toBe('afternoon');
    expect(greetingGroup({ now: at(20), signals: [], playing: false })).toBe('evening');
    expect(greetingGroup({ now: at(2), signals: [], playing: false })).toBe('general');
  });
  it('uses listening mood only with recent, meaningful evidence', () => {
    const now = at(14);
    const signal = { trackId: 'a', at: now - 30_000, seconds: 40 };
    expect(greetingGroup({ now, signals: [signal], playing: true, mood: mood('chill') })).toBe(
      'calm',
    );
    expect(greetingGroup({ now, signals: [signal], playing: true, mood: mood('upbeat') })).toBe(
      'energetic',
    );
    expect(
      greetingGroup({ now, signals: [signal], playing: true, mood: mood('upbeat', 0.1) }),
    ).toBe('afternoon');
    expect(
      greetingGroup({
        now,
        signals: [{ ...signal, seconds: 4 }],
        playing: true,
        mood: mood('upbeat'),
      }),
    ).toBe('afternoon');
    expect(
      greetingGroup({
        now,
        signals: [{ ...signal, at: now - 2 * 3600_000 }],
        playing: true,
        mood: mood('upbeat'),
      }),
    ).toBe('afternoon');
  });
  it('recognizes a longer listening day or a return without treating new listeners as absent', () => {
    const now = at(14);
    expect(
      greetingGroup({
        now,
        signals: [{ trackId: 'a', at: now - 60_000, seconds: 1200 }],
        playing: true,
      }),
    ).toBe('listening');
    expect(
      greetingGroup({
        now,
        signals: [{ trackId: 'a', at: now - 4 * 86400_000, seconds: 1200 }],
        playing: false,
      }),
    ).toBe('return');
    expect(
      greetingGroup({
        now,
        signals: [{ trackId: 'a', at: now + 1, seconds: 1200 }],
        playing: false,
      }),
    ).toBe('afternoon');
    expect(greetingGroup({ now, signals: [], playing: false })).toBe('afternoon');
  });
});
