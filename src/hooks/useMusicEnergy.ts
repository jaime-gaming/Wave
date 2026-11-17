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
    hasTrack = !!player.current,
    duration = player.current?.duration ?? 0;
  useEffect(() => {
    const root = document.documentElement;
    if (!hasTrack || !player.state.playing || !animation.enabled) {
      root.style.setProperty('--music-energy', '0');
      root.style.setProperty('--music-pulse', '0');
      root.dataset.musicActive = 'false';
      return;
    }
    let stopped = false,
      frame = 0,
      envelope: EnergyEnvelope | undefined,
      smooth = 0,
      bassAvg = 0,
      pulse = 0,
      last = 0,
      triedAt = -Infinity,
      attempts = 0;
    const bands = { bass: 0, body: 0, air: 0 },
      phases = { bass: 0, body: 1.7, air: 3.4 };
    /**
     * Writing a custom property invalidates style for the whole document, so a
     * value that has not visibly changed is not written again.
     */
    const written = new Map<string, string>();
    const write = (name: string, value: string) => {
      if (written.get(name) === value) return;
      written.set(name, value);
      root.style.setProperty(name, value);
    };
    let live: MusicAnalyzer | undefined;
    let fallbackStarted = false;
    const fallback = () => {
      if (fallbackStarted || !blob) return;
      fallbackStarted = true;
      void sourceEnvelope(blob, duration).then((value) => {
        if (!stopped) envelope = value;
      });
    };
    const visible = () => !document.hidden && document.hasFocus();
    const reset = () => {
      root.style.setProperty('--music-energy', '0');
      root.style.setProperty('--music-pulse', '0');
      root.dataset.musicActive = 'false';
      for (const band of ['bass', 'body', 'air']) root.style.setProperty(`--music-${band}`, '0');
      delete root.dataset.musicAnalysis;
      written.clear();
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
      if (now - last >= 30) {
        const delta = Math.min(0.12, (now - last) / 1000);
        last = now;
        const current = latest.current;
        const canRead = visible() && !current.buffering;
        if (blob && canRead && !live && attempts < 4 && now - triedAt > 500) {
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
        const liveAmplitude = blob && canRead ? live?.read() : undefined;
        if (blob && canRead && live && liveAmplitude === undefined && now - triedAt > 1200)
          fallback();

        const playhead = current.readTime();
        // When audio comes from a cross-origin embed (no local blob), create a
        // gentle, breathing ambient pulse driven by playback progress & volume.
        const ambientLevel =
          !blob && canRead && current.volume > 0.01
            ? (0.26 + 0.14 * Math.sin(playhead * 1.35) + 0.08 * Math.cos(playhead * 2.4)) *
              Math.sqrt(current.volume)
            : 0;

        const amplitude = canRead
          ? blob
            ? (liveAmplitude ?? energyAt(envelope, playhead)) * current.volume
            : ambientLevel
          : 0;
        // Compress dynamic range for expressive quiet passages and punchy drops.
        const energy = amplitude > 0.001 ? Math.min(1, Math.pow(amplitude, 0.48) * 1.48) : 0;
        const analysisState =
          liveAmplitude !== undefined
            ? 'live'
            : envelope
              ? 'envelope'
              : !blob
                ? 'ambient'
                : 'unavailable';
        if (root.dataset.musicAnalysis !== analysisState)
          root.dataset.musicAnalysis = analysisState;
        const measured = blob && canRead ? live?.readBands() : undefined;
        for (const band of ['bass', 'body', 'air'] as const) {
          const target = measured
            ? Math.min(1, Math.pow(measured[band] * current.volume, 0.48) * 1.62)
            : !blob
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    energy *
                      (band === 'bass'
                        ? 0.92 + 0.16 * Math.sin(playhead * 1.6)
                        : band === 'body'
                          ? 0.85 + 0.18 * Math.cos(playhead * 1.1 + 1.2)
                          : 0.72 + 0.2 * Math.sin(playhead * 2.1 + 2.4)),
                  ),
                )
              : energy;
          // Snappy attack on rises, silky organic glow decay on drops.
          const attack = band === 'bass' ? 0.56 : band === 'body' ? 0.45 : 0.42;
          const release = band === 'bass' ? 0.14 : 0.11;
          bands[band] += (target - bands[band]) * (target > bands[band] ? attack : release);
          if (energy > 0.001 && bands[band] > 0.006)
            phases[band] +=
              delta *
              (0.18 + bands[band] * (band === 'bass' ? 0.95 : band === 'body' ? 1.25 : 1.55));
          write(`--music-${band}`, bands[band].toFixed(3));
          write(`--music-${band}-x`, (Math.sin(phases[band]) * 24).toFixed(2) + '%');
          write(`--music-${band}-y`, (Math.cos(phases[band] * 0.73) * 19).toFixed(2) + '%');
        }
        // Detect rhythmic transients above the trailing bass floor so kicks bloom smoothly.
        bassAvg += (bands.bass - bassAvg) * 0.08;
        const beatHit = Math.max(0, (bands.bass - bassAvg) * 3.1);
        pulse += (Math.min(1, beatHit) - pulse) * (beatHit > pulse ? 0.62 : 0.16);
        write('--music-pulse', pulse.toFixed(3));
        write('--music-angle', ((phases.body * 18) % 360).toFixed(1) + 'deg');

        smooth += (energy - smooth) * (energy > smooth ? 0.46 : 0.15);
        write('--music-energy', smooth.toFixed(3));
        const active = String(energy > 0.001);
        if (root.dataset.musicActive !== active) root.dataset.musicActive = active;
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
  }, [blob, hasTrack, duration, player.state.playing, animation.enabled]);
}
