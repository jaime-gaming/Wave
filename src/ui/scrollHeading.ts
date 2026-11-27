export function headingAtDock(
  headings: readonly { top: number; text: string }[],
  threshold: number,
): string {
  let text = '';
  let closest = -Infinity;
  for (const heading of headings) {
    if (!Number.isFinite(heading.top) || !heading.text.trim()) continue;
    if (heading.top <= threshold && heading.top > closest) {
      closest = heading.top;
      text = heading.text.trim();
    }
  }
  return text;
}
