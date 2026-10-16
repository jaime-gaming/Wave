"""Render a warm piano score from recorded CC0 acoustic-piano samples.

Samples: Versilian Community Sample Library, Grand Piano, Kawai - Legacy.
No square-wave, chiptune, speech, or commercial recording is used.
"""

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

parser = argparse.ArgumentParser()
parser.add_argument("--samples", default=".cache/audio")
parser.add_argument("--output", default=".cache/promo-v2/piano-score.wav")
args = parser.parse_args()
SR = 44100
DURATION = 60
rng = np.random.default_rng(162026)
roots = {
    "C1": 36,
    "C2": 48,
    "C3": 60,
    "E3": 64,
    "G3": 67,
    "B3": 71,
    "D4": 74,
    "F4": 77,
    "A4": 81,
    "C5": 84,
}
samples = {}
for name, midi in roots.items():
    source = Path(args.samples) / f"GrandPno_Main_Sus_{name}_v1_rr1.wav"
    if not source.exists():
        raise SystemExit(
            f"Missing {source}. See docs/media/PROMO_PRODUCTION.md for the CC0 source."
        )
    data, rate = sf.read(source, always_2d=True)
    if rate != SR:
        data = resample_poly(data, SR, rate, axis=0)
    # Retain each recording's attack and stereo character; remove DC and low handling noise.
    data = data - np.mean(data, axis=0, keepdims=True)
    data = sosfilt(butter(2, 38, "highpass", fs=SR, output="sos"), data, axis=0)
    samples[midi] = data
cache = {}


def note(midi):
    if midi not in cache:
        root = min(samples, key=lambda r: abs(r - midi))
        ratio = 2 ** ((midi - root) / 12)
        # Offline playback-rate conversion of an acoustic recording, never an oscillator.
        denominator = 10000
        data = resample_poly(
            samples[root], denominator, round(denominator * ratio), axis=0
        )
        cache[midi] = data
    return cache[midi]


mix = np.zeros((SR * (DURATION + 8), 2), dtype=np.float64)


def play(time, midi, velocity=0.5, hold=2.8, pan=0):
    data = note(midi).copy()
    length = min(len(data), int((hold + 1.0) * SR))
    data = data[:length]
    t = np.arange(length) / SR
    envelope = np.ones(length)
    release = np.maximum(0, t - hold)
    envelope *= np.exp(-release * 4.5)
    envelope[-min(220, length) :] *= np.linspace(1, 0, min(220, length))
    # Soft velocities keep hammer attacks organic rather than brittle.
    data *= (velocity * envelope)[:, None]
    data[:, 0] *= np.sqrt(1 - pan * 0.35)
    data[:, 1] *= np.sqrt(1 + pan * 0.35)
    start = max(0, round(time * SR))
    end = min(len(mix), start + length)
    mix[start:end] += data[: end - start]


# 96 BPM, twelve two-bar phrases. D major, B minor, G major, suspended A.
phrases = [
    (38, [62, 66, 69], [74, 73, 69, 66]),
    (35, [59, 62, 66], [69, 66, 74, 73]),
    (31, [55, 59, 62], [71, 69, 66, 62]),
    (33, [57, 62, 64], [69, 71, 73, 69]),
    (38, [62, 66, 69], [74, 78, 76, 73]),
    (35, [59, 62, 66], [74, 73, 69, 66]),
    (31, [55, 59, 62], [71, 74, 73, 69]),
    (33, [57, 61, 64], [73, 76, 74, 69]),
    (35, [59, 62, 66], [74, 73, 69, 66]),
    (31, [55, 59, 62], [71, 69, 66, 62]),
    (33, [57, 62, 64], [69, 73, 74, 76]),
    (38, [62, 66, 69], [74, 73, 69, 62]),
]
for phrase, (bass, chord, melody) in enumerate(phrases):
    base = phrase * 5 + 0.15
    strength = 0.42 if phrase == 0 else (0.46 if phrase < 5 else 0.5)
    play(base, bass, 0.62, 4.1, -0.1)
    for beat in range(8):
        midi = chord[[0, 1, 2, 1, 0, 2, 1, 2][beat]]
        play(
            base + beat * 0.625 + rng.uniform(-0.012, 0.012),
            midi,
            strength * rng.uniform(0.84, 1.08),
            2.3,
            (-0.28 if beat % 2 == 0 else 0.28),
        )
    if phrase > 0:
        for i, midi in enumerate(melody):
            play(
                base + 0.32 + i * 1.25 + rng.uniform(-0.016, 0.016),
                midi,
                0.37 * rng.uniform(0.88, 1.05),
                1.7,
                0.05,
            )
# A deliberate soft resolution, followed by a room tail rather than a cut-off.
for i, midi in enumerate([38, 57, 62, 66, 69, 74]):
    play(56.8 + i * 0.045, midi, 0.44 if i < 2 else 0.32, 3.0, (i - 3) * 0.07)

# Subtle asymmetric room reflections. The source retains its own recorded stereo image.
room = sosfilt(butter(2, 6500, "lowpass", fs=SR, output="sos"), mix, axis=0)
for delay, gain in [
    (0.043, 0.085),
    (0.071, 0.065),
    (0.113, 0.048),
    (0.167, 0.038),
    (0.239, 0.028),
    (0.347, 0.02),
    (0.491, 0.014),
]:
    n = round(delay * SR)
    mix[n:] += room[:-n, ::-1] * gain
mix = mix[: SR * DURATION]
t = np.arange(len(mix)) / SR
mix *= np.minimum(1, t / 1.2)[:, None]
mix *= np.minimum(1, np.maximum(0, (60 - t) / 2.4))[:, None]
peak = float(np.max(np.abs(mix)))
if peak > 0:
    mix *= 0.72 / peak
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
sf.write(output, mix, SR, subtype="PCM_24")
print(
    f"Acoustic piano score: {DURATION}s, stereo {SR}Hz, peak {20 * np.log10(np.max(np.abs(mix))):.1f}dBFS"
)
