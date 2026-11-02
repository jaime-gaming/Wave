import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The clip view is one grid, and the small-window rules above it also match a
 * closed lyric reader. When those win, they pull the record, the words and the
 * transport into a single cell: the sleeve shrinks to nothing, the text lands on
 * top of it and the transport ends up wherever the cascade leaves it. This is a
 * cheap guard against that coming back — not a stylesheet parser.
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles/player.css'), 'utf8');

/** Where the last rule for a selector fragment starts. */
const lastIndexOfSelector = (fragment: string) => {
  const matches = [...css.matchAll(/[^{}]+\{/g)].filter((match) => match[0].includes(fragment));
  return matches.length ? (matches[matches.length - 1].index ?? -1) : -1;
};

describe('the clip view owns the layout it is responsible for', () => {
  it('is written after the rules for a closed lyric reader', () => {
    const closed = lastIndexOfSelector(":has(.stage-lyrics[data-open='false']) .stage-record");
    const clip = lastIndexOfSelector('.clip-live .stage-layout .stage-record');
    expect(closed).toBeGreaterThan(-1);
    expect(clip).toBeGreaterThan(closed);
  });

  it('places the parts again for a closed reader instead of inheriting one cell', () => {
    // The record, the words and the transport each need a position for the
    // closed state too, or the base rule puts them all in the first cell.
    for (const part of ['stage-record', 'stage-lyrics', 'stage-controls']) {
      expect(lastIndexOfSelector(`.clip-live .stage-layout .${part}`)).toBeGreaterThan(-1);
    }
    expect(
      lastIndexOfSelector(".clip-live .stage-layout:has(.stage-lyrics[data-open='false'])"),
    ).toBeGreaterThan(-1);
  });
});
