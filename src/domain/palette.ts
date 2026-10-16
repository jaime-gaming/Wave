export function blendHue(from: number, to: number, progress: number) {
  const p = Math.max(0, Math.min(1, progress)),
    delta = ((to - from + 540) % 360) - 180;
  return (((from + delta * p) % 360) + 360) % 360;
}
