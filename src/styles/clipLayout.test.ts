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
const app = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

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

  it('paints the room the picture is in, in either theme', () => {
    // A video cannot be recoloured. If the player keeps the light theme's pale
    // floor while a clip is live, the picture can only ever be a dark rectangle
    // inside it, which is the defect this is here to stop.
    const blocks = [...css.matchAll(/\.player-modal:has\(\.clip-live\)\s*\{([^}]*)\}/g)].map(
      (match) => match[1] ?? '',
    );
    expect(blocks.some((body) => /color-scheme:\s*dark/.test(body))).toBe(true);
    expect(blocks.some((body) => /--background:/.test(body))).toBe(true);
    // And the backdrop is painted with that same floor, never with a slab colour
    // of its own: two paints that nearly match still read as a square.
    const backdrop = css.slice(css.indexOf('.video-backdrop {'));
    expect(backdrop.slice(0, 400)).toContain('background: var(--player-bg, var(--background))');
    expect(css).not.toContain('#05070c');
    // An open dialog locks the page behind it. Without that, the page keeps its
    // scrollbar and the full-screen player stops one scrollbar short of the
    // window's edge — a strip of page beside the picture.
    expect(app).toMatch(/html:has\(dialog\[open\]\)\s*\{\s*overflow:\s*hidden;/);
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
