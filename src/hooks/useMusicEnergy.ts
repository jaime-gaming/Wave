import { sourceEnvelope } from '../audio/sourceEnvelope';
import { MusicAnalyzer } from '../audio/MusicAnalyzer';
import { useEffect, useRef } from 'react';
import { energyAt, type EnergyEnvelope } from '../domain/musicEnergy';
import { useWaveMotion } from '../ui/motion';
import type { usePlayer } from './usePlayer';
export function useMusicEnergy(player: ReturnType<typeof usePlayer>) {
  const animation = useWaveMotion();
  const latest = useRef(player);
  useEffect(() => {
    latest.current = player;
  }, [player]);
  const blob = player.current?.blob,
    duration = player.current?.duration ?? 0;
  useEffect(() => {
    const root = document.documentElement;
    if (!blob || !player.state.playing || !animation.enabled) {
      root.style.setProperty('--music-energy', '0');
      root.dataset.musicActive = 'false';
      return;
    }
    let stopped = false,
      frame = 0,
      envelope: EnergyEnvelope | undefined,
      smooth = 0,
      last = 0,
      triedAt = -Infinity,
      attempts = 0;
    const bands = { bass: 0, body: 0, air: 0 },
      phases = { bass: 0, body: 1.7, air: 3.4 };
    let live: MusicAnalyzer | undefined;
    let fallbackStarted = false;
    const fallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      void sourceEnvelope(blob, duration).then((value) => {
        if (!stopped) envelope = value;
      });
    };
    const visible = () => !document.hidden && document.hasFocus();
    const reset = () => {
      root.style.setProperty('--music-energy', '0');
      root.dataset.musicActive = 'false';
      for (const band of ['bass', 'body', 'air']) root.style.setProperty(`--music-${band}`, '0');
      delete root.dataset.musicAnalysis;
    };
    const visibility = () => {
      live?.setVisible(visible());
      if (!visible()) {
        cancelAnimationFrame(frame);
        frame = 0;
        reset();
      } else if (!frame) frame = requestAnimationFrame(tick);
    };
    const tick = (now: number) => {
      if (now - last >= 40) {
        const delta = Math.min(0.12, (now - last) / 1000);
        last = now;
        const current = latest.current;
        const canRead = visible() && !current.buffering;
        if (canRead && !live && attempts < 4 && now - triedAt > 500) {
          triedAt = now;
          const element = current.readElement();
          if (element && element.readyState >= 2) {
            attempts++;
            try {
              live = new MusicAnalyzer(element);
            } catch {
              fallback();
            }
          }
        }
        const liveAmplitude = canRead ? live?.read() : undefined;
        if (canRead && live && liveAmplitude === undefined && now - triedAt > 1200) fallback();
        const amplitude = canRead
          ? (liveAmplitude ?? energyAt(envelope, current.readTime())) * current.volume
          : 0;
        // Compress dynamic range for visible quiet passages, without inventing beats.
        const energy = amplitude > 0.001 ? Math.min(1, Math.sqrt(amplitude) * 1.4) : 0;
        root.dataset.musicAnalysis =
          liveAmplitude !== undefined ? 'live' : envelope ? 'envelope' : 'unavailable';
        const measured = canRead ? live?.readBands() : undefined;
        for (const band of ['bass', 'body', 'air'] as const) {
          const target = measured
            ? Math.min(1, Math.sqrt(measured[band] * current.volume) * 1.5)
            : energy;
          bands[band] += (target - bands[band]) * (target > bands[band] ? 0.4 : 0.12);
          if (energy > 0.001 && bands[band] > 0.008)
            phases[band] +=
              delta * (0.12 + bands[band] * (band === 'bass' ? 0.7 : band === 'body' ? 0.95 : 1.2));
          root.style.setProperty(`--music-${band}`, bands[band].toFixed(4));
          root.style.setProperty(
            `--music-${band}-x`,
            (Math.sin(phases[band]) * 18).toFixed(3) + '%',
          );
          root.style.setProperty(
            `--music-${band}-y`,
            (Math.cos(phases[band] * 0.71) * 14).toFixed(3) + '%',
          );
        }
        smooth += (energy - smooth) * (energy > smooth ? 0.4 : 0.16);
        root.style.setProperty('--music-energy', smooth.toFixed(4));
        root.dataset.musicActive = String(energy > 0.001);
      }
      frame = visible() ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', visibility);
    window.addEventListener('focus', visibility);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      reset();
      live?.dispose();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', visibility);
      window.removeEventListener('focus', visibility);
    };
  }, [blob, duration, player.state.playing, animation.enabled]);
}
