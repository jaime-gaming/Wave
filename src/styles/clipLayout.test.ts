import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/player.css'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

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
    const blocks = [...css.matchAll(/\.player-modal:has\(\.clip-live\)\s*\{([^}]*)\}/g)].map(
      (match) => match[1] ?? '',
    );
    expect(blocks.some((body) => /color-scheme:\s*dark/.test(body))).toBe(true);
    expect(blocks.some((body) => /--background:/.test(body))).toBe(true);

    const backdrop = css.slice(css.indexOf('.video-backdrop {'));
    expect(backdrop.slice(0, 400)).toContain('background: var(--player-bg, var(--background))');
    expect(css).not.toContain('#05070c');

    expect(app).toMatch(/html:has\(dialog\[open\]\)\s*\{\s*overflow:\s*hidden;/);

    const dialog = css.slice(css.indexOf('.player-modal {'), css.indexOf('.player-modal >'));
    expect(dialog).toContain('border: 0');
  });

  it('places the parts again for a closed reader instead of inheriting one cell', () => {
    for (const part of ['stage-record', 'stage-lyrics', 'stage-controls']) {
      expect(lastIndexOfSelector(`.clip-live .stage-layout .${part}`)).toBeGreaterThan(-1);
    }
    expect(
      lastIndexOfSelector(".clip-live .stage-layout:has(.stage-lyrics[data-open='false'])"),
    ).toBeGreaterThan(-1);
  });
});
