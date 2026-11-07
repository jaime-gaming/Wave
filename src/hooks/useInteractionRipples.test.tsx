import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MotionPreference } from '../ui/motion';
import { useInteractionRipples } from './useInteractionRipples';
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel, finished: new Promise(() => {}) }));
beforeEach(() => {
  animate.mockClear();
  cancel.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});
function Controls() {
  useInteractionRipples();
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <button key={i} className="icon-button">
          Action {i}
        </button>
      ))}
    </>
  );
}
it('bounds rapid presses to one ripple per control and eight across the page', () => {
  const { container } = render(<Controls />);
  const first = screen.getByRole('button', { name: 'Action 0' });
  for (let i = 0; i < 20; i++) fireEvent.keyDown(first, { key: 'Enter' });
  expect(first.querySelectorAll('.wave-ripple')).toHaveLength(1);
  for (const button of screen.getAllByRole('button')) fireEvent.keyDown(button, { key: ' ' });
  expect(container.querySelectorAll('.wave-ripple')).toHaveLength(8);
  expect(first).not.toHaveClass('ripple-anchor');
});
it('ignores held keys, disabled and inert controls, and document-level targets', () => {
  const { container } = render(<Controls />);
  const first = screen.getByRole('button', { name: 'Action 0' });
  fireEvent.keyDown(first, { key: 'Enter', repeat: true });
  first.setAttribute('aria-disabled', 'true');
  fireEvent.keyDown(first, { key: 'Enter' });
  first.removeAttribute('aria-disabled');
  container.setAttribute('inert', '');
  fireEvent.keyDown(first, { key: 'Enter' });
  fireEvent.keyDown(document, { key: 'Enter' });
  expect(animate).not.toHaveBeenCalled();
});
it('removes feedback and anchor styles immediately when motion is disabled', () => {
  const { rerender } = render(
    <MotionPreference.Provider value={true}>
      <Controls />
    </MotionPreference.Provider>,
  );
  const first = screen.getByRole('button', { name: 'Action 0' });
  fireEvent.keyDown(first, { key: 'Enter' });
  expect(first.querySelector('.wave-ripple')).not.toBeNull();
  rerender(
    <MotionPreference.Provider value={false}>
      <Controls />
    </MotionPreference.Provider>,
  );
  expect(first.querySelector('.wave-ripple')).toBeNull();
  expect(first).not.toHaveClass('ripple-anchor');
  expect(cancel).toHaveBeenCalled();
  fireEvent.keyDown(first, { key: 'Enter' });
  expect(first.querySelector('.wave-ripple')).toBeNull();
});
