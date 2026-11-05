import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AudioTrimEditor } from './AudioTrimEditor';
import { makeTrack } from '../test/fixtures';

it('edits non-destructive bounds and prevents inverted selections', () => {
  const change = vi.fn();
  const track = makeTrack({ trim: { start: 2, end: 85 } });
  render(<AudioTrimEditor track={track} onChange={change} />);
  const start = screen.getByRole('slider', { name: 'Trim start' });
  for (let i = 0; i < 3; i++) fireEvent.keyDown(start, { key: 'ArrowRight' });
  expect(change).toHaveBeenLastCalledWith({ start: 5, end: 85 });
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Trim end' }), { key: 'Home' });
  expect(change).toHaveBeenLastCalledWith({ start: 5, end: 5.1 });
  expect(track.trim).toEqual({ start: 2, end: 85 });
});
it('does not offer file editing for embedded tracks', () => {
  const { container } = render(
    <AudioTrimEditor
      track={makeTrack({ blob: undefined, source: 'youtube' })}
      onChange={vi.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});

it('zooms on a held edge and resets on release without native controls', async () => {
  vi.useFakeTimers();
  const { container, unmount } = render(<AudioTrimEditor track={makeTrack()} onChange={vi.fn()} />);
  const handle = screen.getByRole('slider', { name: 'Trim start' });
  handle.setPointerCapture = vi.fn();
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(460);
  });
  expect(container.querySelector('.is-zoomed')).toBeInTheDocument();
  fireEvent.pointerUp(handle);
  expect(container.querySelector('.is-zoomed')).not.toBeInTheDocument();
  expect(container.querySelector('audio[controls]')).not.toBeInTheDocument();
  expect(container.querySelector('input[type="number"]')).not.toBeInTheDocument();
  unmount();
  vi.useRealTimers();
});
