import type { ListeningSignal, ListenerMood } from './mood';

export const GREETINGS = {
  general: ['Hello, {name}', 'Hi, {name}', 'Good to see you, {name}'],
  morning: [
    'Good morning, {name}',
    'A little music for your morning, {name}',
    'Start the day your way, {name}',
  ],
  afternoon: [
    'Hello this afternoon, {name}',
    'A moment for music, {name}',
    'Your music is here, {name}',
  ],
  evening: [
    'Good evening, {name}',
    'Music for your evening, {name}',
    'Settle in with your music, {name}',
  ],
  calm: ['A quieter moment, {name}', 'Take your time, {name}', 'Let the music play, {name}'],
  energetic: [
    'Keep the rhythm going, {name}',
    'Let the music move, {name}',
    'Here for the music, {name}',
  ],
  return: [
    'Welcome back, {name}',
    'Nice to have you back, {name}',
    'Your music missed you, {name}',
  ],
  listening: [
    'More music for you, {name}',
    'Keep listening, {name}',
    'Your soundtrack continues, {name}',
  ],
} as const;

export type GreetingGroup = keyof typeof GREETINGS;

export function greetingGroup({
  now,
  signals,
  mood,
  playing,
}: {
  now: number;
  signals: ListeningSignal[];
  mood?: ListenerMood;
  playing: boolean;
}): GreetingGroup {
  const valid = signals.filter(
    (signal) =>
      Number.isFinite(signal.at) &&
      signal.at! <= now &&
      Number.isFinite(signal.seconds) &&
      signal.seconds > 0,
  );
  const last = valid.reduce((latest, signal) => Math.max(latest, signal.at!), 0);
  if (!playing && last && now - last > 3 * 24 * 60 * 60 * 1000) return 'return';
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const heardToday = valid.reduce(
    (sum, signal) => (signal.at! >= dayStart.getTime() ? sum + signal.seconds : sum),
    0,
  );
  if (playing && heardToday >= 20 * 60) return 'listening';
  const recent = valid.some((signal) => now - signal.at! <= 90 * 60 * 1000 && signal.seconds >= 25);
  if (playing && recent && mood && mood.confidence >= 0.35) {
    if (mood.primary === 'chill' || mood.primary === 'focus' || mood.primary === 'night')
      return 'calm';
    if (mood.primary === 'energetic' || mood.primary === 'upbeat' || mood.primary === 'intense')
      return 'energetic';
  }
  const hour = new Date(now).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'general';
}

export function greetingFor(group: GreetingGroup, seed: number): string {
  const options = GREETINGS[group];
  const safe = Number.isFinite(seed) ? Math.max(0, Math.min(0.999999, seed)) : 0;
  return options[Math.floor(safe * options.length)];
}
